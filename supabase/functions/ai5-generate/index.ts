import { createClient } from "npm:@supabase/supabase-js@2";
import { createAi5GenerateHandler, type Ai5Gateway } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "",
  publishable =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    "";
const caller = (token: string) =>
  createClient(url, publishable, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const gateway: Ai5Gateway = {
  async authenticate(token, key) {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: key },
    });
    const user = await r.json();
    if (!r.ok || !user.id) throw Error("unauthorized");
    return user.id;
  },
  async context(token, snapshotId) {
    const { data, error } = await caller(token).rpc("ai5_generation_context", {
      p_snapshot_id: snapshotId,
    });
    if (error || !data) throw Error("context");
    return data;
  },
  async replay(token, snapshotId, key) {
    const { data, error } = await caller(token).rpc("ai5_generation_replay", {
      p_snapshot_id: snapshotId,
      p_key: key,
    });
    if (error) throw Error("replay_failed");
    return data;
  },
  async save(token, snapshotId, idempotencyKey, model, summary, metadata) {
    const { data, error } = await caller(token).rpc("ai5_save_generation", {
      p_snapshot_id: snapshotId,
      p_key: idempotencyKey,
      p_model: model,
      p_text: summary,
      p_metadata: metadata,
    });
    if (error || !data) {
      console.error("AI5 save stage failed", {
        stage: "save",
        code: error?.code ?? null,
        message: error?.message ?? "empty response",
      });
      throw Object.assign(Error("persistence"), { category: "persistence" });
    }
    return data;
  },
};
const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
Deno.serve(
  createAi5GenerateHandler({
    gateway,
    allowedOrigins: (
      Deno.env.get("ALLOWED_ORIGINS") ??
      "http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    provider: async (payload) => {
      if (!apiKey) throw Error("provider_unconfigured");
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw Error(`provider_${response.status}`);
      return response.json();
    },
  }),
);
