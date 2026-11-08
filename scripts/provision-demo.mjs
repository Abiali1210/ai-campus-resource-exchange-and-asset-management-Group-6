// Explicit synthetic-project provisioning. Never invoked by the browser or npm install.
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DEMO_ACCOUNT_PASSWORD",
];
for (const name of required)
  if (!process.env[name] || process.env[name].includes("your-"))
    throw new Error(`Set ${name} in untracked .env.local first.`);
if (process.env.CONFIRM_SYNTHETIC_SEED !== "yes")
  throw new Error(
    "Set CONFIRM_SYNTHETIC_SEED=yes only for the intended synthetic coursework project.",
  );
const password = process.env.DEMO_ACCOUNT_PASSWORD;
if (password.length < 16)
  throw new Error("Use a local-only demo password of at least 16 characters.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  options,
);
const client = () =>
  createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    options,
  );
const fixture = JSON.parse(
  await readFile(
    new URL("../tests/fixtures/foundation.json", import.meta.url),
    "utf8",
  ),
);
const checked = async (query) => {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};
for (const d of fixture.departments)
  await checked(
    service
      .from("departments")
      .upsert(
        { department_id: d.departmentId, name: d.name, active: d.active },
        { onConflict: "department_id", ignoreDuplicates: true },
      ),
  );
for (const c of fixture.categories)
  await checked(
    service
      .from("categories")
      .upsert(
        {
          category_id: c.categoryId,
          parent_category_id: c.parentCategoryId,
          name: c.name,
        },
        { onConflict: "category_id", ignoreDuplicates: true },
      ),
  );

const existing = [];
for (let page = 1; ; page++) {
  const data = await checked(
    service.auth.admin.listUsers({ page, perPage: 200 }),
  );
  existing.push(...data.users);
  if (data.users.length < 200) break;
}
const emailFor = (p) =>
  `${p.name
    .replace(/^Synthetic /, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}@demo.example.test`;
async function ensureAuth(profile) {
  const email = emailFor(profile),
    known = existing.find((u) => u.email === email);
  if (known) return { id: known.id, created: false, email };
  const data = await checked(
    service.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  existing.push(data.user);
  return { id: data.user.id, created: true, email };
}
const sys = fixture.users.find((p) => p.roles.includes("system_administrator"));
const initial = await ensureAuth(sys);
const initialProfile = await checked(
  service
    .from("profiles")
    .select("user_id")
    .eq("user_id", initial.id)
    .maybeSingle(),
);
if (!initialProfile) {
  try {
    await checked(
      service.rpc("bootstrap_administrator", {
        p_input: {
          userId: initial.id,
          departmentId: sys.departmentId,
          name: sys.name,
        },
      }),
    );
  } catch (error) {
    if (initial.created) {
      const cleanup = await service.auth.admin.deleteUser(initial.id);
      if (cleanup.error)
        throw new Error(
          `Initial administrator setup failed and Auth cleanup needs operator reconciliation for ${initial.id}. No credentials were logged.`,
        );
    }
    throw new Error(`Initial administrator setup failed: ${error.message}`);
  }
}
const admin = client();
await checked(
  admin.auth.signInWithPassword({ email: initial.email, password }),
);
const identities = new Map([[sys.userId, initial.id]]),
  accountList = [
    { email: initial.email, roles: sys.roles.join(", "), active: true },
  ];
for (const p of fixture.users.filter((p) => p !== sys)) {
  const user = await ensureAuth(p);
  identities.set(p.userId, user.id);
  const profile = await checked(
    service
      .from("profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  );
  if (!profile) {
    try {
      await checked(
        admin.rpc("save_profile", {
          p_input: {
            userId: user.id,
            name: p.name,
            departmentId: p.departmentId,
            roles: p.roles,
            active: p.active,
            operationKey: randomUUID(),
          },
        }),
      );
    } catch (error) {
      if (user.created) {
        const cleanup = await service.auth.admin.deleteUser(user.id);
        if (cleanup.error)
          throw new Error(
            `Account setup failed and Auth cleanup needs operator reconciliation for ${user.id}. The unlinked account has no application profile.`,
          );
      }
      throw error;
    }
  }
  accountList.push({
    email: user.email,
    roles: p.roles.join(", "),
    active: p.active,
  });
}
for (const a of fixture.assets) {
  // Re-running setup preserves existing records; it never resets shared work.
  const existingAsset = await checked(
    service.from("assets").select("asset_id").eq("name", a.name).maybeSingle(),
  );
  if (existingAsset) continue;
  const p = fixture.stockPortions.find((p) => p.assetId === a.assetId);
  const custodian = fixture.users.find((u) => u.userId === p.custodianId);
  const rep = client();
  await checked(
    rep.auth.signInWithPassword({ email: emailFor(custodian), password }),
  );
  const asset = await checked(
    rep.rpc("save_asset", {
      p_input: {
        ...a,
        assetId: undefined,
        portionId: undefined,
        ownerDepartmentId: p.ownerDepartmentId,
        custodianId: identities.get(p.custodianId),
        assignedLocation: p.assignedLocation,
        condition: p.condition,
        operationKey: randomUUID(),
      },
    }),
  );
  if (p.state === "Available")
    await checked(
      rep.rpc("set_publication", {
        p_asset_id: asset.assetId,
        p_expected_version: asset.version,
        p_publish: true,
        p_operation_key: randomUUID(),
      }),
    );
  else if (p.state !== "Registered") {
    // Initial synthetic historical states only; not a production state-changing endpoint.
    await checked(
      service
        .from("stock_portions")
        .update({ state: p.state })
        .eq("asset_id", asset.assetId),
    );
    await checked(
      service
        .from("audit_logs")
        .insert({
          actor_id: null,
          event: "system.synthetic-history-seeded",
          target_type: "asset",
          target_id: asset.assetId,
          before_data: { state: "Registered" },
          after_data: {
            state: p.state,
            source: "explicit synthetic fixture provisioning",
          },
        }),
    );
  }
  await rep.auth.signOut();
}
await admin.auth.signOut();
console.table(accountList);
console.log(
  "Synthetic provisioning finished. Passwords were not printed. Existing accounts/records were preserved.",
);
console.log(
  "Verify inactive login, RLS, private files and live AI separately in your actual project.",
);
