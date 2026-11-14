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
  userId: "fixture-static-id",
  departmentId: "dept",
  active: true,
  roles: ["representative"],
  name: "Synthetic representative-Engineering",
};
const fixture = {
  departments: [{ departmentId: "dept", name: "Engineering" }],
  users: [rep],
};
const hostedId = "hosted-auth-uuid";

function harness({
  authEmail = "REP-ENG@DEMO.TEST",
  authId = hostedId,
  profile = {},
  count = 0,
  signInError = null,
  statuses = [],
  duplicateAcrossPages = false,
} = {}) {
  const invoke = vi.fn(async (_name, { body }) => ({
    data: {
      results: statuses
        .filter(([id]) => body.assetIds.includes(id))
        .map(([assetId, status]) => ({ assetId, status })),
    },
    error: { message: "raw-sensitive-error" },
  }));
  const signIn = vi.fn(async () => ({
    data: { user: { id: authId, email: authEmail } },
    error: signInError,
  }));
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
              userId: authId,
              departmentId: "dept",
              active: true,
              roles: ["representative"],
              ...profile,
            },
          },
          error: null,
        };
      if (name !== "search_assets" || !params?.p_filters?.ownOnly)
        throw new Error("unexpected RPC");
      const { offset, limit } = params.p_filters;
      const rows = Array.from({ length: count }, (_, i) => ({
        assetId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      })).slice(offset, offset + limit);
      if (duplicateAcrossPages && offset === 200)
        rows.push({ assetId: "00000000-0000-4000-8000-000000000000" });
      return {
        data: rows,
        error: null,
      };
    },
  );
  const clientFactory = vi.fn(() => ({
    auth: { signInWithPassword: signIn },
    rpc,
    functions: { invoke },
  }));
  return { clientFactory, signIn, rpc, invoke };
}
const run = (
  h: ReturnType<typeof harness>,
  options: Record<string, unknown> = {},
) =>
  runBackfill({
    env,
    fixture,
    clientFactory: h.clientFactory,
    ...options,
  } as Parameters<typeof runBackfill>[0]);

describe("AI2 embedding backfill", () => {
  it("accepts hosted UUID distinct from fixture metadata and uses caller-scoped RPCs", async () => {
    const h = harness();
    await run(h);
    expect(h.signIn).toHaveBeenCalledWith({
      email: "rep-eng@demo.test",
      password: env.DEMO_ACCOUNT_PASSWORD,
    });
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      "foundation_bootstrap",
      "search_assets",
    ]);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.rpc.mock.calls).not.toContainEqual(
      expect.arrayContaining([rep.userId]),
    );
  });
  it("rejects an authenticated alias mismatch", async () => {
    const h = harness({ authEmail: "wrong@demo.test" });
    await expect(run(h)).rejects.toThrow("identity mismatch");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["missing profile", { profile: null }],
    ["inactive profile", { profile: { active: false } }],
    ["wrong department", { profile: { departmentId: "other" } }],
    ["missing Representative role", { profile: { roles: [] } }],
    ["wrong hosted identity", { profile: { userId: rep.userId } }],
  ])("rejects %s", async (_label, variation) => {
    const h = harness();
    if (variation.profile === null)
      h.rpc.mockImplementationOnce(async () => ({
        data: { profile: null },
        error: null,
      }));
    else
      h.rpc.mockImplementationOnce(async () => ({
        data: {
          profile: {
            userId: hostedId,
            departmentId: "dept",
            active: true,
            roles: ["representative"],
            ...variation.profile,
          },
        },
        error: null,
      }));
    await expect(run(h)).rejects.toThrow("Representative scope");
    expect(h.rpc).toHaveBeenCalledOnce();
  });
  it("rejects duplicate fixture aliases before creating a client or authenticating", async () => {
    const h = harness();
    const duplicate = { ...rep, userId: "another-static-id" };
    await expect(
      runBackfill({
        env,
        fixture: { ...fixture, users: [rep, duplicate] },
        clientFactory: h.clientFactory,
      }),
    ).rejects.toThrow("ambiguous");
    expect(h.clientFactory).not.toHaveBeenCalled();
    expect(h.signIn).not.toHaveBeenCalled();
  });
  it("redacts secrets and raw errors from logs and caught safe errors", async () => {
    const h = harness({
      signInError: { message: "raw-token-sensitive-error" },
    });
    const output: string[] = [];
    let publicError = "";
    try {
      await run(h, { log: (line: string) => output.push(line) });
    } catch (error) {
      publicError = String(error);
    }
    for (const secret of [
      env.DEMO_ACCOUNT_PASSWORD,
      env.SUPABASE_PUBLISHABLE_KEY,
      "raw-token-sensitive-error",
      "raw-sensitive-error",
    ]) {
      expect(output.join(" ")).not.toContain(secret);
      expect(publicError).not.toContain(secret);
    }
    expect(publicError).toContain("authentication failed");
  });
  it("requires both exact apply confirmations", () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(() =>
      validateGuards(env, { apply: true, confirmation: TARGET_REF }),
    ).toThrow("confirmation");
    expect(() =>
      validateGuards(
        { ...env, CONFIRM_SYNTHETIC_SEED: "yes" },
        { apply: true, confirmation: "wrong" },
      ),
    ).toThrow("confirmation");
    expect(() =>
      validateGuards(
        { ...env, CONFIRM_SYNTHETIC_SEED: "yes" },
        { apply: true, confirmation: TARGET_REF },
      ),
    ).not.toThrow();
  });
  it.each([
    [`https://${TARGET_REF}.supabase.co.attacker.test`, "host mismatch"],
    [`http://${TARGET_REF}.supabase.co`, "HTTP"],
    [`https://${TARGET_REF}.supabase.co:8443`, "port"],
    [`https://${TARGET_REF}.supabase.co/unexpected`, "path"],
    [`https://${TARGET_REF}.supabase.co?unexpected=1`, "query"],
    [`https://${TARGET_REF}.supabase.co#unexpected`, "fragment"],
    [`https://user:pass@${TARGET_REF}.supabase.co`, "credentials"],
    ["https://wrong.supabase.co", "wrong ref"],
  ])("rejects unsafe URL (%s)", (url) => {
    expect(() =>
      validateGuards({ ...env, SUPABASE_URL: url }, { apply: false }),
    ).toThrow("project reference mismatch");
  });
  it("rejects an empty linked reference when a link file is present", () => {
    expect(() => validateGuards(env, { apply: false }, "")).toThrow(
      "linked project reference mismatch",
    );
    expect(() => validateGuards(env, { apply: false }, null)).not.toThrow();
  });
  it("apply batches at ten, deduplicates pagination, and counts mixed results", async () => {
    const statuses = [
      ["00000000-0000-4000-8000-000000000000", "created"],
      ["00000000-0000-4000-8000-000000000001", "updated"],
      ["00000000-0000-4000-8000-000000000002", "unchanged"],
      ["00000000-0000-4000-8000-000000000003", "failed"],
    ];
    const h = harness({ count: 240, statuses, duplicateAcrossPages: true });
    const result = await run(h, {
      env: { ...env, CONFIRM_SYNTHETIC_SEED: "yes" },
      args: { apply: true, confirmation: TARGET_REF },
    });
    expect(
      h.invoke.mock.calls.map(([, { body }]) => body.assetIds.length),
    ).toEqual(Array(24).fill(10));
    expect(result).toEqual({
      created: 1,
      updated: 1,
      unchanged: 1,
      failed: 237,
    });
    expect(
      h.rpc.mock.calls
        .filter(([name]) => name === "search_assets")
        .map(([, args]) => args.p_filters.offset),
    ).toEqual([0, 200]);
  });
  it.each([
    [{}, "confirmation flag missing"],
    [{ confirmation: TARGET_REF }, "environment confirmation missing"],
    [
      { confirmation: "wrong", env: { ...env, CONFIRM_SYNTHETIC_SEED: "yes" } },
      "wrong target",
    ],
  ])("rejects apply in runBackfill when %s", async (options) => {
    const h = harness();
    await expect(
      run(h, { args: { apply: true, ...options }, env: options.env ?? env }),
    ).rejects.toThrow("confirmation");
    expect(h.clientFactory).not.toHaveBeenCalled();
  });
  it("suppresses raw invoke errors from output", async () => {
    const h = harness({ count: 1 });
    const output: string[] = [];
    await run(h, {
      env: { ...env, CONFIRM_SYNTHETIC_SEED: "yes" },
      args: { apply: true, confirmation: TARGET_REF },
      log: (line: string) => output.push(line),
    });
    expect(output.join(" ")).toContain("details suppressed");
    for (const secret of [
      "raw-sensitive-error",
      env.SUPABASE_PUBLISHABLE_KEY,
      env.DEMO_ACCOUNT_PASSWORD,
    ]) {
      expect(output.join(" ")).not.toContain(secret);
    }
  });
});
