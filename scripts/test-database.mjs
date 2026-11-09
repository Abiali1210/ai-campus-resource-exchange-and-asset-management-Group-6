import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Real PostgreSQL functions, grants and RLS run in an isolated WASM engine.
// The auth schema is a minimal adapter, not live Supabase Auth or JWT verification.
const db = new PGlite();
await db.waitReady;
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
`);
for (const file of (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
}
await db.exec(await readFile("supabase/seed.sql", "utf8"));
const fixture = JSON.parse(
  await readFile("tests/fixtures/foundation.json", "utf8"),
);
for (const u of fixture.users)
  await db.query("insert into auth.users(id) values($1)", [u.userId]);
const person = (role, department = fixture.departments[0].departmentId) =>
  fixture.users.find(
    (u) => u.roles.includes(role) && u.departmentId === department,
  );
const admin = person("system_administrator"),
  rep = person("representative"),
  requester = person("requester");
const otherRep = person("representative", fixture.departments[1].departmentId);
let checks = 0;
async function as(user, sql, args = [], role = "authenticated") {
  await db.exec(`set role ${role}`);
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user?.userId ?? "",
    ]);
    return await db.query(sql, args);
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}
const rpc = async (user, name, input, role = "authenticated") =>
  (
    await as(
      user,
      `select public.${name}($1::jsonb) as result`,
      [JSON.stringify(input)],
      role,
    )
  ).rows[0].result;
async function check(name, fn) {
  try {
    await fn();
    checks++;
    console.log(`PASS ${name}`);
  } catch (error) {
    throw new Error(`${name}: ${error.message}`);
  }
}
async function denied(fn, pattern) {
  await assert.rejects(fn, pattern);
}
try {
  await check(
    "first administrator provisioning is service-only and atomic",
    async () => {
      await denied(
        () =>
          rpc(requester, "bootstrap_administrator", {
            userId: admin.userId,
            departmentId: admin.departmentId,
            name: admin.name,
          }),
        /permission denied/i,
      );
      await rpc(
        null,
        "bootstrap_administrator",
        {
          userId: admin.userId,
          departmentId: admin.departmentId,
          name: admin.name,
        },
        "service_role",
      );
      await denied(
        () =>
          rpc(
            null,
            "bootstrap_administrator",
            {
              userId: rep.userId,
              departmentId: rep.departmentId,
              name: rep.name,
            },
            "service_role",
          ),
        /already exists/,
      );
    },
  );
  for (const u of fixture.users.filter((u) => u.userId !== admin.userId))
    await rpc(admin, "save_profile", { ...u, operationKey: randomUUID() });
  await check("anonymous and inactive access denied", async () => {
    await denied(
      () => as(null, "select public.foundation_bootstrap()"),
      /Unauthorized/,
    );
    await denied(
      () =>
        as(
          fixture.users.find((u) => !u.active),
          "select public.foundation_bootstrap()",
        ),
      /Unauthorized/,
    );
  });
  await check(
    "technical administrator cannot mutate assets or trust browser roles",
    async () => {
      await denied(
        () =>
          rpc(admin, "save_asset", {
            name: "Forbidden",
            ownerDepartmentId: admin.departmentId,
            roles: ["representative"],
            operationKey: randomUUID(),
          }),
        /Forbidden/,
      );
      await denied(
        () =>
          rpc(requester, "save_profile", {
            ...requester,
            roles: ["system_administrator"],
            operationKey: randomUUID(),
          }),
        /Forbidden/,
      );
      await denied(
        () =>
          as(
            requester,
            "insert into public.user_roles values(auth.uid(),'system_administrator')",
          ),
        /permission denied/,
      );
    },
  );
  const assetInput = {
    name: "Reusable monitor",
    description: "HDMI 24-inch monitor",
    categoryId: fixture.categories[0].categoryId,
    specifications: { connector: "HDMI" },
    tags: [],
    materials: [],
    trackingMode: "individual",
    totalQty: 1,
    purchaseDate: "2022-01-01",
    unitValue: 600,
    unitMassKg: 5,
    ownerDepartmentId: rep.departmentId,
    custodianId: rep.userId,
    assignedLocation: "Engineering Store",
    condition: "Good",
    operationKey: randomUUID(),
  };
  let saved;
  await check(
    "asset save and publication are atomic and return typed projection",
    async () => {
      saved = await rpc(rep, "save_asset", assetInput);
      assert.equal(saved.state, "Registered");
      assert.equal(saved.unitValue, 600);
      assert.equal(saved.version, 1);
      assert.equal(
        (await rpc(rep, "save_asset", assetInput)).assetId,
        saved.assetId,
      );
      await as(rep, "select public.set_publication($1,$2,true,$3)", [
        saved.assetId,
        1,
        randomUUID(),
      ]);
    },
  );
  await check(
    "requester sees marketplace without financial data or private audit",
    async () => {
      const list = await rpc(requester, "search_assets", {});
      assert.equal(list.length, 1);
      assert.equal(list[0].assetId, saved.assetId);
      assert.equal("unitValue" in list[0], false);
      const detail = (
        await as(requester, "select public.asset_detail($1) as result", [
          saved.assetId,
        ])
      ).rows[0].result;
      assert.deepEqual(detail.history, []);
      await denied(
        () => rpc(requester, "search_assets", { minValue: 1 }),
        /Forbidden/,
      );
      await denied(
        () => as(requester, "select unit_value from public.assets"),
        /permission denied/,
      );
    },
  );
  await check(
    "cross-department representative cannot edit or expose finance",
    async () => {
      const row = (await rpc(otherRep, "search_assets", {}))[0];
      assert.equal("unitValue" in row, false);
      await denied(
        () =>
          rpc(otherRep, "save_asset", {
            ...assetInput,
            assetId: saved.assetId,
            ownerDepartmentId: otherRep.departmentId,
            custodianId: otherRep.userId,
            expectedVersion: 2,
            operationKey: randomUUID(),
          }),
        /Forbidden/,
      );
    },
  );
  await check(
    "all nine role classes obey marketplace and specialist scope",
    async () => {
      for (const role of fixture.roles) {
        const u = person(role);
        const list = await rpc(u, "search_assets", {});
        const allowed = [
          "requester",
          "representative",
          "business_administrator",
          "procurement",
          "finance",
          "sustainability",
        ].includes(role);
        assert.equal(list.length, allowed ? 1 : 0, role);
        if (list.length)
          assert.equal(
            "unitValue" in list[0],
            ["representative", "business_administrator", "finance"].includes(
              role,
            ),
            role,
          );
      }
    },
  );
  await check(
    "combined quantity, location, fractional age and availability filters work",
    async () => {
      assert.equal(
        (
          await rpc(requester, "search_assets", {
            keyword: "HDMI",
            condition: "Good",
            categoryId: assetInput.categoryId,
            departmentId: rep.departmentId,
            location: "Store",
            minQty: 1,
            minAge: 0.5,
            maxAge: 100,
            availability: "available",
          })
        ).length,
        1,
      );
      assert.equal(
        (await rpc(requester, "search_assets", { minQty: 2 })).length,
        0,
      );
      assert.equal(
        (
          await rpc(requester, "search_assets", {
            keyword: "No matching equipment",
          })
        ).length,
        0,
      );
    },
  );
  await check(
    "publication retry is idempotent and stale updates rejected",
    async () => {
      const key = randomUUID();
      await as(rep, "select public.set_publication($1,2,false,$2)", [
        saved.assetId,
        key,
      ]);
      await as(rep, "select public.set_publication($1,2,false,$2)", [
        saved.assetId,
        key,
      ]);
      await denied(
        () =>
          as(rep, "select public.set_publication($1,2,true,$2)", [
            saved.assetId,
            randomUUID(),
          ]),
        /Conflict/,
      );
      await denied(
        () =>
          rpc(rep, "save_asset", {
            ...assetInput,
            assetId: saved.assetId,
            expectedVersion: 1,
            operationKey: randomUUID(),
          }),
        /Conflict/,
      );
    },
  );
  await check(
    "invalid quantities and missing registration fields roll back",
    async () => {
      for (const qty of [0, -1, 1.5])
        await denied(
          () =>
            rpc(rep, "save_asset", {
              ...assetInput,
              totalQty: qty,
              operationKey: randomUUID(),
            }),
          /Validation/,
        );
      for (const key of [
        "name",
        "assignedLocation",
        "custodianId",
        "ownerDepartmentId",
        "categoryId",
      ]) {
        const invalid = { ...assetInput, operationKey: randomUUID() };
        delete invalid[key];
        await denied(
          () => rpc(rep, "save_asset", invalid),
          /Validation|Forbidden/,
        );
      }
      await denied(
        () =>
          rpc(rep, "save_asset", {
            ...assetInput,
            categoryId: randomUUID(),
            operationKey: randomUUID(),
          }),
        /Validation: known categoryId required/,
      );
      assert.equal(
        (await db.query("select count(*)::int n from public.assets")).rows[0].n,
        1,
      );
    },
  );
  await check(
    "catalogue cannot change quantity or certify condition during editing",
    async () => {
      await denied(
        () =>
          rpc(rep, "save_asset", {
            ...assetInput,
            assetId: saved.assetId,
            expectedVersion: 3,
            condition: "Excellent",
            operationKey: randomUUID(),
          }),
        /condition updates/,
      );
      await denied(
        () =>
          rpc(rep, "save_asset", {
            ...assetInput,
            assetId: saved.assetId,
            expectedVersion: 3,
            totalQty: 2,
            trackingMode: "batch",
            operationKey: randomUUID(),
          }),
        /quantity cannot/,
      );
    },
  );
  await check("database rejects stock conservation violations", async () => {
    await denied(
      () =>
        db.query("update public.stock_portions set qty=2 where asset_id=$1", [
          saved.assetId,
        ]),
      /stock quantity/,
    );
    assert.equal(
      (
        await db.query(
          "select qty from public.stock_portions where asset_id=$1",
          [saved.assetId],
        )
      ).rows[0].qty,
      1,
    );
  });
  await check(
    "deactivation revokes existing authenticated profile access",
    async () => {
      await rpc(admin, "save_profile", {
        ...requester,
        active: false,
        operationKey: randomUUID(),
      });
      await denied(
        () => as(requester, "select public.search_assets()"),
        /Unauthorized/,
      );
    },
  );
  await check(
    "profile and business audit cannot be rewritten by ordinary roles",
    async () => {
      await denied(
        () => as(rep, "delete from public.audit_logs"),
        /permission denied/,
      );
      assert.ok(
        (await db.query("select count(*)::int n from public.audit_logs"))
          .rows[0].n > 0,
      );
    },
  );
  await check(
    "unknown condition is visible while unsafe or allocated stock cannot publish or withdraw",
    async () => {
      const unknown = await rpc(rep, "save_asset", {
        ...assetInput,
        name: "Unknown assessment",
        condition: "Unknown",
        operationKey: randomUUID(),
      });
      await as(rep, "select public.set_publication($1,1,true,$2)", [
        unknown.assetId,
        randomUUID(),
      ]);
      const list = await rpc(otherRep, "search_assets", {
        keyword: "Unknown assessment",
        availability: "available",
      });
      assert.equal(list[0].condition, "Unknown");
      await db.query(
        "update public.stock_portions set state='Unfit' where asset_id=$1",
        [unknown.assetId],
      );
      await denied(
        () =>
          as(rep, "select public.set_publication($1,2,true,$2)", [
            unknown.assetId,
            randomUUID(),
          ]),
        /Conflict/,
      );
      assert.equal(
        (
          await rpc(otherRep, "search_assets", {
            keyword: "Unknown assessment",
            availability: "available",
          })
        ).length,
        0,
      );
      await db.query(
        "update public.stock_portions set state='Reserved' where asset_id=$1",
        [unknown.assetId],
      );
      await denied(
        () =>
          as(rep, "select public.set_publication($1,2,false,$2)", [
            unknown.assetId,
            randomUUID(),
          ]),
        /Conflict/,
      );
    },
  );
  await check(
    "provisioning payloads accept every fixture asset and preserve batch quantity",
    async () => {
      // Mirror the provisioner's domain payloads without claiming the Auth Admin API ran.
      for (const d of fixture.departments)
        await as(
          null,
          "insert into public.departments(department_id,name,active) values($1,$2,$3) on conflict(department_id) do nothing",
          [d.departmentId, d.name, d.active],
          "service_role",
        );
      for (const a of fixture.assets) {
        const p = fixture.stockPortions.find((p) => p.assetId === a.assetId);
        const custodian = fixture.users.find((u) => u.userId === p.custodianId);
        const row = await rpc(custodian, "save_asset", {
          ...a,
          assetId: undefined,
          portionId: undefined,
          ownerDepartmentId: p.ownerDepartmentId,
          custodianId: p.custodianId,
          assignedLocation: p.assignedLocation,
          condition: p.condition,
          operationKey: randomUUID(),
        });
        assert.equal(row.qty, a.totalQty);
        assert.equal(row.totalQty, a.totalQty);
        assert.equal(row.unitValue, a.unitValue);
        assert.equal(row.trackingMode, a.trackingMode);
        if (p.state === "Available")
          await as(custodian, "select public.set_publication($1,$2,true,$3)", [
            row.assetId,
            row.version,
            randomUUID(),
          ]);
      }
    },
  );
  console.log(`\n${checks} PostgreSQL core integration checks passed.`);
  console.log(
    "Not tested here: live Supabase Auth/JWT verification, Auth Admin provisioning or hosted Edge account administration.",
  );
} finally {
  await db.close();
}
