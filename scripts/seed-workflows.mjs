import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { demoEmailFor } from "./demo-accounts.mjs";
for (const key of [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "DEMO_ACCOUNT_PASSWORD",
])
  if (!process.env[key]) throw new Error(`Missing ${key}. See Part 2 handoff.`);
if (process.env.CONFIRM_SYNTHETIC_SEED !== "yes")
  throw new Error(
    "Set CONFIRM_SYNTHETIC_SEED=yes for the intended synthetic coursework project.",
  );
const foundation = JSON.parse(
  await readFile("tests/fixtures/foundation.json", "utf8"),
);
const recipes = JSON.parse(
  await readFile("tests/fixtures/workflows.json", "utf8"),
);
const emailFor = (p) => demoEmailFor(p, foundation.departments);
const clients = [];
async function login(
  role,
  department = foundation.departments[0].departmentId,
) {
  const p = foundation.users.find(
    (p) => p.roles.includes(role) && p.departmentId === department,
  );
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  clients.push(client);
  const { data, error } = await client.auth.signInWithPassword({
    email: emailFor(p),
    password: process.env.DEMO_ACCOUNT_PASSWORD,
  });
  if (error)
    throw new Error(
      `Synthetic ${role} login failed. Verify existing account access and the selected project's provisioning. ${error.message}`,
    );
  return { client, id: data.user.id, department };
}
async function rpc(actor, name, args = {}) {
  const { data, error } = await actor.client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
const command = (actor, input) =>
  rpc(actor, "workflow_command", {
    p_input: { ...input, operationKey: randomUUID() },
  });
const workspace = (actor) => rpc(actor, "workflow_workspace");
try {
  const supplier = await login("representative"),
    receiver = await login(
      "representative",
      foundation.departments[1].departmentId,
    ),
    requester = await login("requester", receiver.department),
    facilities = await login("facilities");
  const requiredDate = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  for (const recipe of recipes.cases) {
    const purpose = `[Part 2 fixture v1 ${recipe.key}] ${recipe.purpose}`;
    const prior = (await workspace(requester)).requests.find(
      (q) => q.purpose === purpose,
    );
    if (prior) {
      console.log(
        `PRESERVED ${recipe.key}: existing request ${prior.requestId} (${prior.status}); verify recipe totals manually if an earlier seed was interrupted.`,
      );
      continue;
    }
    const name = `[Part 2 fixture v1 ${recipe.key}] Synthetic HDMI displays`;
    let stock = (
      await rpc(supplier, "search_assets", {
        p_filters: { own: true, keyword: name },
      })
    ).find((a) => a.name === name);
    if (!stock) {
      stock = await rpc(supplier, "save_asset", {
        p_input: {
          name,
          description: "Synthetic C4-C6 demonstration only",
          categoryId: foundation.categories[0].categoryId,
          specifications: { connector: "HDMI" },
          trackingMode: recipe.stockQty === 1 ? "individual" : "batch",
          totalQty: recipe.stockQty,
          ownerDepartmentId: supplier.department,
          custodianId: supplier.id,
          assignedLocation: "Engineering / Demo store",
          condition: "Good",
          operationKey: randomUUID(),
        },
      });
    }
    if (stock.state === "Registered")
      await rpc(supplier, "set_publication", {
        p_asset_id: stock.assetId,
        p_expected_version: stock.version,
        p_publish: true,
        p_operation_key: randomUUID(),
      });
    else if (stock.state !== "Available")
      throw new Error(
        `Fixture ${recipe.key}: existing stock is in a workflow. Preserve it and reconcile manually.`,
      );
    const req = await command(requester, {
      action: "submitRequest",
      purpose,
      categoryId: foundation.categories[0].categoryId,
      qty: recipe.requestQty,
      specifications: { connector: "HDMI" },
      condition: "Good",
      urgency: "Normal",
      requiredDate,
      destination: "Science / Demo lab",
    });
    if (recipe.outcome !== "Open") {
      const select = async (portionId, qty) => {
        const q = (await workspace(requester)).requests.find(
          (q) => q.requestId === req.requestId,
        );
        return command(requester, {
          action: "recordInterest",
          requestId: req.requestId,
          expectedVersion: q.version,
          portionId,
          qty,
          reason: "Synthetic selection; supplier review still required",
        });
      };
      const i = await select(
        stock.portionId,
        recipe.approveQty || recipe.requestQty,
      );
      if (recipe.approveQty) {
        let t = await command(supplier, {
          action: "approveReservation",
          interestId: i.interestId,
          expectedVersion: i.version,
          qty: recipe.approveQty,
          reason:
            "Synthetic fixture: suitable HDMI stock, submission order reviewed",
        });
        const step = async (actor, action, extra = {}) => {
          t = await command(actor, {
            action,
            transferId: t.transferId,
            expectedVersion: t.version,
            reason: "Synthetic demonstration fixture",
            ...extra,
          });
        };
        if (recipe.outcome !== "Pending Approval") {
          await step(supplier, "approveRelease", {
            facilitiesId: facilities.id,
          });
          await step(facilities, "schedule", {
            scheduledAt: new Date(Date.now() + 3600000).toISOString(),
            arrangements: "Facilities trolley to Science demo lab",
            handlingCost: 0,
            transportCost: 0,
          });
          if (recipe.outcome !== "Scheduled") {
            await step(facilities, "dispatch", {
              qty: recipe.approveQty,
              location: "Facilities / Campus trolley",
            });
            if (recipe.outcome === "Completed")
              await step(receiver, "receive", {
                qty: recipe.approveQty,
                condition: "Good",
                accept: true,
                location: "Science / Demo lab",
              });
            else {
              await step(receiver, "receive", {
                qty: recipe.approveQty - 1,
                condition: "Poor",
                accept: false,
                location: "Science / Receiving bay",
              });
              if (recipe.outcome === "Returned")
                await step(supplier, "confirmReturn", {
                  qty: recipe.approveQty,
                  condition: "Poor",
                  location: "Engineering / Quarantine",
                });
            }
          }
        }
        if (recipe.extraAllocation) {
          const available = (
            await rpc(supplier, "search_assets", {
              p_filters: { assetId: stock.assetId },
            })
          ).find((p) => p.state === "Available");
          const extra = await select(
            available.portionId,
            recipe.extraAllocation,
          );
          await command(supplier, {
            action: "approveReservation",
            interestId: extra.interestId,
            expectedVersion: extra.version,
            qty: recipe.extraAllocation,
            reason:
              "Synthetic second partial allocation; remaining demand checked",
          });
        }
      }
    }
    const q = (await workspace(requester)).requests.find(
      (q) => q.requestId === req.requestId,
    );
    for (const key of ["acceptedQty", "allocatedQty", "remainingQty"])
      if (q[key] !== recipe[key])
        throw new Error(
          `Fixture ${recipe.key} has unexpected ${key}; preserve and inspect.`,
        );
    console.log(
      `CREATED ${recipe.key}: ${q.requestId}; accepted=${q.acceptedQty}, active=${q.allocatedQty}, remaining=${q.remainingQty}`,
    );
  }
  console.log(
    "Workflow fixtures finished. Existing records preserved; no passwords printed.",
  );
} finally {
  for (const c of clients) await c.auth.signOut();
}
