import { describe, expect, it, vi } from "vitest";
import {
  createAi2MatchHandler,
  rankCandidates,
  serializeRequest,
  type MatchGateway,
} from "../supabase/functions/ai2-match/handler";
const source = {
  requestId: "00000000-0000-4000-8000-000000000001",
  version: 2,
  category: "IT",
  purpose: "Display need",
  requirements: { z: { b: " two  words ", a: 2 }, a: true },
  minimumCondition: "Good",
  remainingQty: 2,
};
const candidate = (id: string, condition = "Good", similarity = 0.8) => ({
  portion_id: id,
  asset_id: id,
  asset_name: "Projector",
  description: "",
  category_id: "IT",
  specifications: {},
  qty: 2,
  condition,
  department_id: "00000000-0000-4000-8000-000000000099",
  department_name: "ME",
  assigned_location: "Main",
  physical_location: "Main",
  similarity,
});
const validVector = () =>
  Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));
function setup(
  overrides: Partial<MatchGateway> = {},
  embed = vi.fn(async () => validVector()),
) {
  const gateway: MatchGateway = {
    authenticate: async () => "actor",
    source: async () => source,
    existing: async () => null,
    candidates: async () => [candidate("00000000-0000-4000-8000-000000000010")],
    save: async (_a, i) => ({ runId: "run", input: i }),
    visible: async () => ({ outcome: "completed", recommendations: [] }),
    ...overrides,
  };
  const handler = createAi2MatchHandler({
    gateway,
    embed,
    allowedOrigins: ["https://allowed.test"],
  });
  const request = (
    body: unknown = {
      requestId: source.requestId,
      operationKey: "00000000-0000-4000-8000-000000000002",
    },
    origin?: string,
  ) =>
    handler(
      new Request("https://edge.test", {
        method: "POST",
        headers: {
          authorization: "Bearer session",
          apikey: "sb_publishable_test",
          ...(origin ? { origin } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  return { handler, request, gateway, embed };
}
describe("AI2 match serialization and ranking", () => {
  it("normalizes whitespace and recursively sorts requirement keys in readable labeled text", () =>
    expect(serializeRequest(source)).toBe(
      'Category: IT\nPurpose: Display need\nMinimum condition: Good\nMandatory requirements: {"a":true,"z":{"a":2,"b":"two words"}}',
    ));
  it("rejects arrays, nulls, non-finite and unsupported requirement values and enforces limits", () => {
    for (const requirements of [
      { x: [1] },
      { x: null },
      { x: NaN },
      { x: undefined },
    ])
      expect(() => serializeRequest({ ...source, requirements })).toThrow();
    expect(() =>
      serializeRequest({ ...source, purpose: "x".repeat(501) }),
    ).toThrow();
    expect(() =>
      serializeRequest({ ...source, requirements: { x: "x".repeat(301) } }),
    ).toThrow();
  });
  it("applies finalized condition factors across supported eligible bands", () => {
    for (const [minimum, condition] of [
      ["Excellent", "Excellent"],
      ["Good", "Excellent"],
      ["Good", "Good"],
      ["Fair", "Excellent"],
      ["Fair", "Good"],
      ["Fair", "Fair"],
    ]) {
      const r = rankCandidates({ ...source, minimumCondition: minimum }, [
        candidate("p", condition),
      ]);
      expect(r[0].c).toBe(1);
    }
    expect(() => rankCandidates(source, [candidate("p", "Fair")])).toThrow();
  });
  it("uses exact formulas, zero unavailable L/T/K/W/E, warnings and no redistribution", () => {
    const r = rankCandidates(source, [candidate("p")])[0];
    expect(r.l).toBe(0);
    expect([r.t, r.k, r.w, r.e]).toEqual([0, 0, 0, 0]);
    expect(r.missingEvidence).toHaveLength(5);
    expect(r.compatibilityScore).toBeCloseTo(100 * (0.65 * 0.8 + 0.15 + 0.1));
    expect(r.finalRankScore).toBeCloseTo(100 * 0.6 * r.f);
    expect(r.semanticCosineScore).toBe(0.8);
    expect(r.reason).toContain("Weak match");
  });
  it("clamps S but retains raw cosine, ties by semantic then asset and portion IDs, caps five", () => {
    const x = rankCandidates(source, [
      candidate("z", "Good", 0.8),
      candidate("a", "Good", 0.9),
      candidate("b", "Good", 0.9),
    ]);
    expect(x.map((y) => y.assetId)).toEqual(["a", "b", "z"]);
    expect(rankCandidates(source, [candidate("p", "Good", 1.5)])[0].s).toBe(1);
    expect(
      rankCandidates(source, [candidate("p", "Good", -1.5)])[0]
        .semanticCosineScore,
    ).toBe(-1);
    expect(
      rankCandidates(
        source,
        Array.from({ length: 8 }, (_, i) => candidate(String(i))),
      ).length,
    ).toBe(5);
  });
  it("uses raw semantic cosine as the second tie-break after equal final rank", () => {
    const rows = [candidate("a", "Good", 0.8), candidate("z", "Good", 0.9)];
    rows[0].qty = 14;
    rows[1].qty = 1;
    const ranked = rankCandidates({ ...source, remainingQty: 20 }, rows);
    expect(ranked[0].finalRankScore).toBeCloseTo(ranked[1].finalRankScore);
    expect(ranked[0].candidate.similarity).toBe(0.9);
  });
});
describe("AI2 match handler", () => {
  it("requires only the browser requestId/operationKey envelope", async () => {
    const { request, embed } = setup();
    expect(
      (
        await request({
          requestId: source.requestId,
          operationKey: "00000000-0000-4000-8000-000000000002",
          recommendations: [],
        })
      ).status,
    ).toBe(400);
    expect(embed).not.toHaveBeenCalled();
  });
  it("returns existing caller-visible result without inference", async () => {
    const prior = { outcome: "completed", runId: "old", recommendations: [] };
    const { request, embed } = setup({ existing: async () => prior });
    expect(await (await request()).json()).toEqual(prior);
    expect(embed).not.toHaveBeenCalled();
  });
  it("embeds once and sends bounded trusted metadata on fresh operation", async () => {
    const save = vi.fn(async (_a: string, i: Record<string, unknown>) => ({
      runId: "run",
    }));
    const { request, embed } = setup(
      { save },
      vi.fn(async () => validVector()),
    );
    await request();
    expect(embed).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toMatchObject({
      outcome: "completed",
      model: "gte-small",
      providerCallCount: 1,
      durationMs: expect.any(Number),
      queryVector: validVector(),
      candidateSnapshot: [
        expect.objectContaining({
          portion_id: expect.any(String),
          similarity: 0.8,
        }),
      ],
    });
  });
  it("returns safe typed request, embedding, stale-candidate and internal outcomes", async () => {
    expect(
      (
        await (
          await setup({
            source: async () => {
              throw Error("secret");
            },
          }).request()
        ).json()
      ).outcome,
    ).toBe("request_not_eligible");
    expect(
      (
        await (
          await setup(
            {},
            vi.fn(async () => {
              throw Error("secret");
            }),
          ).request()
        ).json()
      ).outcome,
    ).toBe("embedding_failed");
    expect(
      (
        await (
          await setup({
            save: async () => {
              throw Error("candidate_set_changed: detail");
            },
          }).request()
        ).json()
      ).outcome,
    ).toBe("candidate_set_changed");
    expect(
      (
        await (
          await setup({
            save: async () => {
              throw Error("secret");
            },
          }).request()
        ).json()
      ).outcome,
    ).toBe("internal_error");
  });
  it("maps invalid vectors to embedding_failed and no candidates to explicit persisted outcome", async () => {
    expect(
      (
        await (
          await setup(
            {},
            vi.fn(async () => [1]),
          ).request()
        ).json()
      ).outcome,
    ).toBe("embedding_failed");
    const save = vi.fn(async (_a: string, i: Record<string, unknown>) => ({
      runId: "run",
    }));
    const { request } = setup({
      candidates: async () => [],
      save,
      visible: async () => ({ outcome: "no_candidates", recommendations: [] }),
    });
    expect(await (await request()).json()).toEqual({
      outcome: "no_candidates",
      recommendations: [],
    });
    expect(save.mock.calls[0][1].providerCallCount).toBe(1);
  });
  it("enforces origin, authentication and no raw error disclosure", async () => {
    const { handler } = setup();
    expect(
      (
        await handler(
          new Request("https://edge.test", {
            method: "POST",
            headers: { origin: "https://evil.test" },
          }),
        )
      ).status,
    ).toBe(403);
    const bad = await handler(
      new Request("https://edge.test", {
        method: "POST",
        headers: { authorization: "Bearer x", apikey: "sb_publishable_test" },
        body: "{}",
      }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.text()).not.toContain("secret");
  });
});
