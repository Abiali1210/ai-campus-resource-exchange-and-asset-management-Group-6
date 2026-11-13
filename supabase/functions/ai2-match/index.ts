import { createClient } from "npm:@supabase/supabase-js@2";
import { createAi2MatchHandler, type MatchGateway } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "",
  publishable =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    "";
function secret(): string | undefined {
  const selected = Deno.env.get("SUPABASE_SECRET_KEY")?.trim();
  if (selected) return selected;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (service) return service;
  try {
    const keys = JSON.parse(
      Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}",
    ) as Record<string, unknown>;
    const key =
      keys[Deno.env.get("SUPABASE_SECRET_KEY_NAME")?.trim() || "default"] ??
      keys.default;
    return typeof key === "string" ? key : undefined;
  } catch {
    return undefined;
  }
}
const serverKey = secret() ?? "";
const admin = serverKey
  ? createClient(url, serverKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : undefined;
const caller = (token: string) =>
  createClient(url, publishable, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const gateway: MatchGateway = {
  async authenticate(token, key) {
    const { data, error } = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: key },
    }).then(async (r) => ({ data: await r.json(), error: !r.ok }));
    if (error || !data.id) throw Error();
    return data.id;
  },
  async source(token, id) {
    const { data, error } = await caller(token).rpc("ai2_request_source", {
      p_request: id,
    });
    if (error || !data) throw Error();
    return data;
  },
  async existing(token, id, key) {
    const { data, error } = await caller(token).rpc("ai2_match_operation", {
      p_request: id,
      p_operation_key: key,
    });
    if (error) throw Error();
    return data;
  },
  async candidates(token, id, vector) {
    const { data, error } = await caller(token).rpc("ai2_candidates", {
      p_request: id,
      p_query: `[${vector.join(",")}]`,
      p_limit: 20,
    });
    if (error)
      throw Error(
        /conflict|stale/i.test(error.message)
          ? "candidate_set_changed"
          : "candidate_lookup_failed",
      );
    return data ?? [];
  },
  async save(actor, input) {
    if (!admin) throw Error();
    const { data, error } = await admin.rpc("ai2_save_match_run", {
      p_actor: actor,
      p_input: input,
    });
    if (error || !data) throw Error(error?.message ?? "save_failed");
    return data;
  },
  async visible(token, id) {
    const { data, error } = await caller(token).rpc("ai2_match_results", {
      p_id: id,
    });
    if (error || !data) throw Error();
    return data;
  },
};
const session = new Supabase.ai.Session("gte-small");
Deno.serve(
  createAi2MatchHandler({
    gateway,
    allowedOrigins: (
      Deno.env.get("ALLOWED_ORIGINS") ??
      "http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    embed: async (text) =>
      Array.from(
        (await session.run(text, {
          mean_pool: true,
          normalize: true,
        })) as Iterable<number>,
      ),
  }),
);
