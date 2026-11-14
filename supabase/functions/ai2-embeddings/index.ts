import { createClient } from "npm:@supabase/supabase-js@2";
import { createAi2Handler, type EmbeddingGateway } from "./handler.ts";

const get = (n: string) => Deno.env.get(n);
const url = get("SUPABASE_URL") ?? "";
function secret(): string | undefined {
  const local = get("SUPABASE_SECRET_KEY")?.trim();
  if (local) return local;
  const localServiceRole = get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (localServiceRole) return localServiceRole;
  try {
    const keys = JSON.parse(get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<
      string,
      unknown
    >;
    const selected =
      keys[get("SUPABASE_SECRET_KEY_NAME")?.trim() || "default"] ??
      keys.default;
    return typeof selected === "string" ? selected : undefined;
  } catch {
    return undefined;
  }
}
const key = secret(),
  server = key
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : undefined;
const caller = (token: string, apiKey: string) => ({
  Authorization: `Bearer ${token}`,
  apikey: apiKey,
  "Content-Type": "application/json",
});
const gateway: EmbeddingGateway = {
  async authenticate(token, key) {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: caller(token, key),
    });
    if (!r.ok) throw new Error();
    const u = await r.json();
    if (typeof u.id !== "string") throw new Error();
    return u.id;
  },
  async bootstrap(token, key) {
    const r = await fetch(`${url}/rest/v1/rpc/foundation_bootstrap`, {
      method: "POST",
      headers: caller(token, key),
      body: "{}",
    });
    if (!r.ok) throw new Error();
    return r.json();
  },
  async source(actor, asset) {
    if (!server) throw new Error();
    const { data, error } = await server.rpc("ai2_embedding_source", {
      p_actor: actor,
      p_asset: asset,
    });
    if (error || !data) throw new Error();
    return data as never;
  },
  async upsert(actor, asset, version, sourceFingerprint, hash, vector) {
    if (!server) throw new Error();
    const { data, error } = await server.rpc("ai2_upsert_asset_embedding", {
      p_actor: actor,
      p_asset: asset,
      p_expected_version: version,
      p_source_fingerprint: sourceFingerprint,
      p_content_hash: hash,
      p_embedding: `[${vector.join(",")}]`,
    });
    if (error || !data) throw new Error();
    return data;
  },
};
const session = new Supabase.ai.Session("gte-small");
const handler = createAi2Handler({
  supabaseUrl: url,
  gateway,
  embed: async (text) => {
    const result = await session.run(text, {
      mean_pool: true,
      normalize: true,
    });
    return Array.from(result as Iterable<number>);
  },
  allowedOrigins: (
    get("ALLOWED_ORIGINS") ?? "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
});
Deno.serve(handler);
