import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { demoEmailFor } from "./demo-accounts.mjs";

export const TARGET_REF = "gcctwsxullabhkddbzgo";
const PAGE_SIZE = 200;
const MAX_PAGES = 100;
const MAX_ASSETS = PAGE_SIZE * MAX_PAGES;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseArgs(args) {
  const apply = args.includes("--apply");
  const confirm = args.filter((arg) => arg.startsWith("--confirm-synthetic="));
  if (
    args.some(
      (arg) => arg !== "--apply" && !arg.startsWith("--confirm-synthetic="),
    ) ||
    confirm.length > 1
  )
    throw new Error("Invalid arguments.");
  return { apply, confirmation: confirm[0]?.split("=")[1] };
}
export function validateGuards(env, args, linkedRef = null) {
  const validOrigin = (() => {
    try {
      const url = new URL(env.SUPABASE_URL);
      return (
        url.protocol === "https:" &&
        url.hostname === `${TARGET_REF}.supabase.co` &&
        !url.username &&
        !url.password &&
        !url.port &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  })();
  if (!validOrigin) throw new Error("SUPABASE_URL project reference mismatch.");
  if (linkedRef !== null && linkedRef !== undefined && linkedRef !== TARGET_REF)
    throw new Error("Local linked project reference mismatch.");
  if (!env.SUPABASE_PUBLISHABLE_KEY || !env.DEMO_ACCOUNT_PASSWORD)
    throw new Error("Missing required environment configuration.");
  if (
    args.apply &&
    (args.confirmation !== TARGET_REF || env.CONFIRM_SYNTHETIC_SEED !== "yes")
  )
    throw new Error("Apply confirmation requirements not met.");
}
const safe = (message) =>
  message === "Asset not found" ? "not_found" : "item_failed";
export async function runBackfill({
  env = process.env,
  args = { apply: false },
  linkedRef = null,
  clientFactory = createClient,
  fixture,
  log = () => {},
}) {
  validateGuards(env, args, linkedRef);
  fixture ??= JSON.parse(
    await readFile(
      new URL("../tests/fixtures/foundation.json", import.meta.url),
      "utf8",
    ),
  );
  const representatives = fixture.users.filter(
    (u) => u.active && u.roles?.length === 1 && u.roles[0] === "representative",
  );
  const selected = representatives.map((representative) => ({
    representative,
    email: demoEmailFor(representative, fixture.departments),
  }));
  const aliases = new Set();
  const mappings = new Set();
  for (const { representative, email } of selected) {
    const alias = email.toLowerCase();
    const mapping = `${alias}|${representative.departmentId}`;
    if (aliases.has(alias) || mappings.has(mapping))
      throw new Error("Synthetic representative alias mapping is ambiguous.");
    aliases.add(alias);
    mappings.add(mapping);
  }
  const counts = { created: 0, updated: 0, unchanged: 0, failed: 0 };
  for (const { representative, email } of selected) {
    const client = clientFactory(
      env.SUPABASE_URL,
      env.SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    let authUser;
    {
      const { data: authData, error } = await client.auth.signInWithPassword({
        email,
        password: env.DEMO_ACCOUNT_PASSWORD,
      });
      if (error)
        throw new Error("Synthetic representative authentication failed.");
      authUser = authData?.user ?? authData?.session?.user;
      if (
        !authUser?.id ||
        typeof authUser.email !== "string" ||
        authUser.email.toLowerCase() !== email.toLowerCase()
      )
        throw new Error(
          "Synthetic representative authentication identity mismatch.",
        );
    }
    const { data: bootstrap, error: bootstrapError } = await client.rpc(
      "foundation_bootstrap",
    );
    const profile = bootstrap?.profile;
    if (
      bootstrapError ||
      !profile ||
      typeof profile !== "object" ||
      Array.isArray(profile) ||
      !profile?.active ||
      profile.userId !== authUser.id ||
      profile.departmentId !== representative.departmentId ||
      !Array.isArray(profile.roles) ||
      profile.roles.length !== 1 ||
      profile.roles[0] !== "representative"
    )
      throw new Error("Representative scope could not be verified.");
    const assets = new Set();
    for (let offset = 0, page = 0; ; offset += PAGE_SIZE, page++) {
      if (page >= MAX_PAGES || assets.size >= MAX_ASSETS)
        throw new Error("Authorized asset discovery exceeded safety bound.");
      const { data: portionRows, error } = await client.rpc("search_assets", {
        p_filters: { ownOnly: true, limit: PAGE_SIZE, offset },
      });
      if (error || !Array.isArray(portionRows))
        throw new Error("Authorized asset discovery failed.");
      for (const row of portionRows) {
        if (!row || typeof row.assetId !== "string" || !UUID.test(row.assetId))
          throw new Error("Malformed authorized asset projection.");
        assets.add(row.assetId);
        if (assets.size > MAX_ASSETS)
          throw new Error("Authorized asset discovery exceeded safety bound.");
      }
      if (portionRows.length < PAGE_SIZE) break;
    }
    const ids = [...assets];
    if (!args.apply) {
      log(`dry-run: ${ids.length} authorized assets for representative`);
      continue;
    }
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const { data, error: invokeError } = await client.functions.invoke(
        "ai2-embeddings",
        { body: { action: "refresh_assets", assetIds: batch } },
      );
      const results = data?.results;
      const statusById = new Map();
      if (Array.isArray(results))
        for (const result of results) {
          if (
            result &&
            batch.includes(result.assetId) &&
            !statusById.has(result.assetId)
          )
            statusById.set(result.assetId, result.status);
        }
      for (const id of batch) {
        const status = statusById.get(id);
        if (
          status === "created" ||
          status === "updated" ||
          status === "unchanged"
        )
          counts[status]++;
        else counts.failed++;
      }
      if (invokeError)
        log("One or more embedding items failed; details suppressed.");
    }
  }
  log(JSON.stringify(counts));
  return counts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let linked = null;
  const linkedPath = new URL("../supabase/.temp/project-ref", import.meta.url);
  if (existsSync(linkedPath)) linked = readFileSync(linkedPath, "utf8").trim();
  validateGuards(process.env, args, linked);
  await runBackfill({
    args,
    linkedRef: linked,
    log: (line) => process.stdout.write(`${line}\n`),
  });
}
if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
)
  main().catch(() => {
    process.stderr.write("Backfill aborted; sensitive details suppressed.\n");
    process.exitCode = 1;
  });
