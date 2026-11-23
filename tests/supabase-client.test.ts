import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Two browser clients each start a GoTrue auth client on the same storage key,
// which logs "Multiple GoTrueClient instances" and can race on token refresh.
describe("browser Supabase client", () => {
  it("is created once, in src/api.ts, and reused everywhere else", () => {
    const dir = fileURLToPath(new URL("../src", import.meta.url));
    const creators = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) =>
        /\bcreateClient\s*\(/.test(readFileSync(join(dir, f), "utf8")),
      );
    expect(creators).toEqual(["api.ts"]);
    expect(readFileSync(join(dir, "ai2.ts"), "utf8")).toMatch(
      /import \{ supabaseClient as client \} from "\.\/api"/,
    );
  });
});
