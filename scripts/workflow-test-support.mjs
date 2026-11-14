import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// WORKFLOW_TEST_DATABASE_URL must point at a NEW EMPTY DISPOSABLE database.
// This adapter never drops schemas or data and refuses nonempty public/auth schemas.
export async function testDatabase() {
  let db, pool;
  if (process.env.WORKFLOW_TEST_DATABASE_URL) {
    const { Pool } = await import("pg");
    pool = new Pool({
      connectionString: process.env.WORKFLOW_TEST_DATABASE_URL,
    });
    const tables = await pool.query(
      "select tablename from pg_tables where schemaname in ('public','auth')",
    );
    if (tables.rows.length) {
      await pool.end();
      throw new Error(
        "Refusing nonempty database. Use a fresh isolated test database.",
      );
    }
    db = {
      query: (sql, args) => pool.query(sql, args),
      exec: (sql) => pool.query(sql),
      close: () => pool.end(),
    };
  } else {
    db = new PGlite();
    await db.waitReady;
  }
  await db.exec(`do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;
    end$$;
    create schema auth; create schema if not exists extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for (const name of (await readdir("supabase/migrations"))
    .filter(
      (n) =>
        n.endsWith(".sql") &&
        (process.env.INCLUDE_AI2 === "1" || !n.includes("_ai2_")),
    )
    .sort())
    await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  const fixture = JSON.parse(
    await readFile("tests/fixtures/foundation.json", "utf8"),
  );
  for (const u of fixture.users) {
    await db.query("insert into auth.users values($1)", [u.userId]);
    await db.query("insert into public.profiles values($1,$2,$3,$4)", [
      u.userId,
      u.departmentId,
      u.name,
      u.active,
    ]);
    for (const role of u.roles)
      await db.query("insert into public.user_roles values($1,$2)", [
        u.userId,
        role,
      ]);
  }
  const person = (role, dep = fixture.departments[0].departmentId) =>
    fixture.users.find((p) => p.roles.includes(role) && p.departmentId === dep);
  // Every actor call uses one transaction/connection. Independent Postgres clients
  // are required for true overlap; a single PGlite engine is intentionally sequential.
  let queue = Promise.resolve();
  async function actorQuery(user, sql, args = [], role = "authenticated") {
    const conn = pool ? await pool.connect() : db;
    try {
      await conn.query("begin");
      await conn.query(`set local role ${role}`);
      await conn.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user?.userId ?? "",
      ]);
      const result = await conn.query(sql, args);
      await conn.query("commit");
      return result;
    } catch (e) {
      await conn.query("rollback");
      throw e;
    } finally {
      if (pool) conn.release();
    }
  }
  function as(user, sql, args = [], role = "authenticated") {
    if (pool) return actorQuery(user, sql, args, role);
    const run = queue.then(() => actorQuery(user, sql, args, role));
    queue = run.catch(() => {});
    return run;
  }
  const command = (user, input) =>
    as(user, "select public.workflow_command($1::jsonb) result", [
      JSON.stringify({ operationKey: randomUUID(), ...input }),
    ]).then((r) => r.rows[0].result);
  const workspace = (user) =>
    as(user, "select public.workflow_workspace() result").then(
      (r) => r.rows[0].result,
    );
  const rep = person("representative"),
    receiver = person("representative", fixture.departments[1].departmentId),
    requester = person("requester", receiver.departmentId),
    facilities = person("facilities");
  const today = (
    await db.query("select to_char(current_date,'YYYY-MM-DD') as date_text")
  ).rows[0].date_text;
  const requiredDate = (
    await db.query("select to_char(current_date+30,'YYYY-MM-DD') as date_text")
  ).rows[0].date_text;
  async function asset(qty = 1, extras = {}) {
    const result = (
      await as(rep, "select public.save_asset($1::jsonb) result", [
        JSON.stringify({
          name: "Synthetic workflow stock " + randomUUID(),
          description: "Disposable synthetic workflow fixture",
          categoryId: fixture.categories[0].categoryId,
          specifications: { connector: "HDMI" },
          trackingMode: qty === 1 ? "individual" : "batch",
          totalQty: qty,
          ownerDepartmentId: rep.departmentId,
          custodianId: rep.userId,
          assignedLocation: "Engineering / Store",
          condition: "Good",
          operationKey: randomUUID(),
          ...extras,
        }),
      ])
    ).rows[0].result;
    await as(rep, "select public.set_publication($1,1,true,$2)", [
      result.assetId,
      randomUUID(),
    ]);
    return { ...result, version: 2, state: "Available" };
  }
  async function request(qty = 1, extras = {}, user = requester) {
    return command(user, {
      action: "submitRequest",
      purpose: "Synthetic display need",
      categoryId: fixture.categories[0].categoryId,
      qty,
      specifications: { connector: "HDMI" },
      condition: "Good",
      urgency: "Normal",
      requiredDate,
      destination: "Science / Lab",
      ...extras,
    });
  }
  async function interest(req, stock, qty = 1, user = requester) {
    const q = (await workspace(user)).requests.find(
      (q) => q.requestId === req.requestId,
    );
    return command(user, {
      action: "recordInterest",
      requestId: req.requestId,
      portionId: stock.portionId,
      qty,
      expectedVersion: q?.version ?? req.version,
      reason: "Synthetic selection; supplier review still required",
    });
  }
  const approve = (i, qty = 1, user = rep) =>
    command(user, {
      action: "approveReservation",
      interestId: i.interestId,
      expectedVersion: i.version,
      qty,
      reason: "Suitable stock reviewed; submission order respected",
    });
  const transfer = (user, t, action, extra = {}) =>
    command(user, {
      action,
      transferId: t.transferId,
      expectedVersion: t.version,
      reason: "Synthetic workflow verification",
      ...extra,
    });
  async function dispatched(qty = 1, reqExtra = {}) {
    const stock = await asset(qty),
      req = await request(qty, reqExtra),
      i = await interest(req, stock, qty);
    let t = await approve(i, qty);
    t = await transfer(rep, t, "approveRelease", {
      facilitiesId: facilities.userId,
    });
    t = await transfer(facilities, t, "schedule", {
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      arrangements: "Trolley to Science Lab",
    });
    t = await transfer(facilities, t, "dispatch", {
      qty,
      location: "Campus transit trolley",
    });
    return { stock, req, i, t };
  }
  return {
    db,
    pool,
    fixture,
    person,
    as,
    command,
    workspace,
    rep,
    receiver,
    requester,
    facilities,
    asset,
    request,
    interest,
    approve,
    transfer,
    dispatched,
    today,
    requiredDate,
  };
}
