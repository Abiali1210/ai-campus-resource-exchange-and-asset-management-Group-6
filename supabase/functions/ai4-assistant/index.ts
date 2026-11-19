import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createAi4AssistantHandler,
  MODEL,
  type Ai4Gateway,
} from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "",
  publishable =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    "";
// Every read runs as the caller, so database permissions decide what the
// assistant can see. No service-role key is used here.
const caller = (token: string) =>
  createClient(url, publishable, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const gateway: Ai4Gateway = {
  async authenticate(token, key) {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: key },
    });
    const user = await r.json();
    if (!r.ok || !user.id) throw Error("unauthorized");
    return user.id;
  },
  async catalogue(token) {
    const { data, error } = await caller(token).rpc("search_assets", {
      p_filters: { marketplaceOnly: true },
    });
    if (error || !Array.isArray(data)) throw Error("context");
    return data;
  },
  async requests(token) {
    const { data, error } = await caller(token).rpc("workflow_workspace");
    if (error || !Array.isArray(data?.requests)) return [];
    return data.requests;
  },
  async categories(token) {
    const { data, error } = await caller(token).rpc("foundation_bootstrap");
    if (error || !Array.isArray(data?.categories)) throw Error("context");
    return data.categories;
  },
};
const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
// Google's error body carries a symbolic status such as RESOURCE_EXHAUSTED or
// PERMISSION_DENIED. Only that code and the reason are logged, never the message
// text, the key or any prompt content.
async function googleErrorCode(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const reason = body?.error?.details?.find?.(
      (d: { reason?: string }) => d?.reason,
    )?.reason;
    return `${body?.error?.status ?? "unknown"}${reason ? `/${reason}` : ""}`;
  } catch {
    return "unparsed";
  }
}
async function probeModel(): Promise<void> {
  const started = Date.now();
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`,
      {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(5000),
      },
    );
    const code = r.ok ? "ok" : await googleErrorCode(r);
    console.log(
      `ai4 probe status=${r.status} error=${code} ms=${Date.now() - started}`,
    );
  } catch (e) {
    console.log(
      `ai4 probe failed=${(e as Error).name} ms=${Date.now() - started}`,
    );
  }
}
Deno.serve(
  createAi4AssistantHandler({
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
      const started = Date.now();
      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            signal: AbortSignal.timeout(14000),
            body: JSON.stringify(payload),
          },
        );
      } catch (e) {
        console.log(
          `ai4 provider failed=${(e as Error).name} ms=${Date.now() - started}`,
        );
        // Diagnostic: a cheap model lookup tells key/model problems apart
        // from a slow generation. Logs Google's status code only.
        await probeModel();
        throw e;
      }
      // Operational log only: status and latency, never prompt or answer text.
      console.log(
        `ai4 provider status=${response.status} ms=${Date.now() - started}`,
      );
      if (!response.ok) {
        console.log(`ai4 provider error=${await googleErrorCode(response)}`);
        throw Error(`provider_${response.status}`);
      }
      return response.json();
    },
  }),
);
