import { describe, expect, it, vi } from "vitest";
import {
  parseArgs,
  runBackfill,
  TARGET_REF,
  validateGuards,
} from "../scripts/backfill-ai2-embeddings.mjs";

const env = {
  SUPABASE_URL: `https://${TARGET_REF}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: "publishable-secret",
  DEMO_ACCOUNT_PASSWORD: "password-secret",
};
const rep = {
  userId: "rep",
  departmentId: "dept",
  active: true,
  roles: ["representative"],
  name: "Synthetic representative-Engineering",
};
const fixture = {
  departments: [{ departmentId: "dept", name: "Engineering" }],
  users: [rep],
};
function mockFactory({
  count = 0,
  statuses = [],
  duplicateAcrossPages = false,
} = {}) {
  const invoke = vi.fn(async (_name, { body }) => ({
    data: {
      results: statuses
        .filter(([assetId]) => body.assetIds.includes(assetId))
        .map(([assetId, status]) => ({ assetId, status })),
    },
    error: { message: "raw-sensitive-error" },
  }));
  const signIn = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(
    async (
      name: string,
      params?: {
        p_filters?: { offset: number; limit: number; ownOnly: boolean };
      },
    ) => {
      if (name === "foundation_bootstrap")
        return {
          data: {
            profile: {
              userId: "rep",
              departmentId: "dept",
              active: true,
              roles: ["representative"],
            },
          },
          error: null,
        };
      if (name !== "search_assets" || !params?.p_filters?.ownOnly)
        throw new Error("unexpected RPC");
      const { offset, limit } = params.p_filters;
      const all = Array.from({ length: count }, (_, i) => ({
        assetId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      }));
      const rows = all.slice(offset, offset + limit);
      if (duplicateAcrossPages && offset === 200) rows.push(all[0]);
      return { data: rows, error: null };
    },
  );
  const factory = () => ({
    auth: { signInWithPassword: signIn },
    functions: { invoke },
    rpc,
  });
  return { factory, invoke, signIn, rpc };
}

describe("AI2 embedding backfill", () => {
  it("defaults to dry-run, rejects guard mismatches, and requires both apply confirmations", () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(() =>
      validateGuards(
        { ...env, SUPABASE_URL: "https://wrong.supabase.co" },
        { apply: false },
      ),
    ).toThrow();
    expect(() => validateGuards(env, { apply: false }, "wrong")).toThrow();
    expect(() =>
      validateGuards(env, { apply: true, confirmation: TARGET_REF }),
    ).toThrow();
    expect(() =>
      validateGuards(
        { ...env, CONFIRM_SYNTHETIC_SEED: "yes" },
        { apply: true, confirmation: TARGET_REF },
      ),
    ).not.toThrow();
  });
  it("authenticates in dry-run, performs no function invokes, and redacts output", async () => {
    const { factory, invoke, signIn, rpc } = mockFactory({ count: 2 });
    const output: string[] = [];
    await runBackfill({
      env,
      fixture,
      clientFactory: factory,
      log: (line) => output.push(line),
    });
    expect(signIn).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "foundation_bootstrap",
      "search_assets",
    ]);
    expect(output.join(" ")).not.toContain("password-secret");
  });
  it("authenticates in apply, batches at ten, and counts mixed results and missing entries once", async () => {
    const statuses = [
      ["00000000-0000-4000-8000-000000000000", "created"],
      ["00000000-0000-4000-8000-000000000001", "unchanged"],
      ["00000000-0000-4000-8000-000000000002", "failed"],
      ["00000000-0000-4000-8000-000000000010", "updated"],
    ] as [string, string][];
    const { factory, invoke, signIn, rpc } = mockFactory({
      count: 240,
      statuses,
      duplicateAcrossPages: true,
    });
    const output: string[] = [];
    const result = await runBackfill({
      env: { ...env, CONFIRM_SYNTHETIC_SEED: "yes" },
      args: { apply: true, confirmation: TARGET_REF },
      fixture,
      clientFactory: factory,
      log: (line) => output.push(line),
    });
    expect(signIn).toHaveBeenCalledOnce();
    expect(
      invoke.mock.calls.map((call) => call[1].body.assetIds.length),
    ).toEqual([
      10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
      10, 10, 10, 10, 10, 10,
    ]);
    expect(
      rpc.mock.calls
        .filter(([name]) => name === "search_assets")
        .map(([, args]) => args.p_filters.offset),
    ).toEqual([0, 200]);
    expect(result).toEqual({
      created: 1,
      updated: 1,
      unchanged: 1,
      failed: 237,
    });
    expect(output.join(" ")).not.toContain("raw-sensitive-error");
    expect(
      invoke.mock.calls.every((call) => call[1].body.assetIds.length <= 10),
    ).toBe(true);
  });
});
