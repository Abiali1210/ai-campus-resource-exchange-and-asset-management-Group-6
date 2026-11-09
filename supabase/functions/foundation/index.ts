import { createFoundationHandler } from "./handler.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const get = (name: string) => Deno.env.get(name);
const supabaseUrl = get("SUPABASE_URL") ?? "";
function runtimeSecretKey(): string | undefined {
  const localKey = get("SUPABASE_SECRET_KEY")?.trim();
  if (localKey) return localKey;
  const rawKeys = get("SUPABASE_SECRET_KEYS");
  if (!rawKeys) return undefined;
  try {
    const keys = JSON.parse(rawKeys) as Record<string, unknown>;
    const name = get("SUPABASE_SECRET_KEY_NAME")?.trim() || "default";
    const selected = keys[name] ?? keys.default;
    return typeof selected === "string" && selected.length > 0
      ? selected
      : undefined;
  } catch {
    return undefined;
  }
}

const secretKey = runtimeSecretKey();
const adminClient = secretKey
  ? createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : undefined;

Deno.serve(
  createFoundationHandler({
    supabaseUrl,
    adminAuth: adminClient
      ? {
          createUser: async (email, password) => {
            const { data, error } = await adminClient.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
            });
            return error ? null : (data.user?.id ?? null);
          },
          deleteUser: async (userId) => {
            const { error } = await adminClient.auth.admin.deleteUser(userId);
            return !error;
          },
        }
      : undefined,
    allowedOrigins: (
      get("ALLOWED_ORIGINS") ?? "http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  }),
);
