import { describe, expect, it } from "vitest";
import {
  beginMatch,
  beginRequestMatch,
  clampReviewQty,
  failMatch,
  fallbackCopy,
  initialMatchState,
  achievableRankScore,
  evidenceAdjustedScore,
  isWeakRecommendation,
  recommendationWarnings,
  reviewPayload,
  settleMatch,
  visibleRecommendations,
  type MatchResult,
  type Recommendation,
} from "../src/ai2";
const rec = (rank = 1, score = 59): Recommendation => ({
  recommendationId: `r${rank}`,
  portionId: "p",
  assetId: "a",
  rank,
  assetName: "Item",
  condition: "Good",
  availableQty: 4,
  compatibilityScore: 81,
  finalRankScore: score,
  reason: "Reason",
  missingEvidence: ["condition evidence"],
  reviewState: "pending",
});
const result = (
  outcome: MatchResult["outcome"],
  recommendations: Recommendation[] = [],
): MatchResult => ({ outcome, requestId: "q", recommendations });
describe("AI2 state and presentation", () => {
  it("starts manually idle with no recommendations", () =>
    expect(initialMatchState()).toMatchObject({
      loading: false,
      rows: [],
      operationKey: "",
    }));
  it("suppresses duplicate starts and preserves key on retry", () => {
    const first = beginMatch(initialMatchState());
    expect(beginMatch(first)).toBe(first);
    const failed = failMatch(first, first.generation);
    const retry = beginMatch(failed);
    expect(retry.operationKey).toBe(first.operationKey);
  });
  it("uses current request state across stale-render-style repeated calls", () => {
    const store = { current: {} };
    const first = beginRequestMatch(store, "q")!;
    const staleRenderRetry = beginRequestMatch(store, "q");
    expect(staleRenderRetry).toBeNull();
    const failed = failMatch(store.current.q, first.generation);
    store.current = { q: failed };
    const retry = beginRequestMatch(store, "q")!;
    expect(retry.operationKey).toBe(first.operationKey);
    expect(beginRequestMatch(store, "q")).toBeNull();
  });
  it("applies only latest generation results", () => {
    const state = { ...beginMatch(initialMatchState()), generation: 2 };
    expect(settleMatch(state, 1, result("completed", [rec()]))).toBe(state);
  });
  it("shows completed rows, empty state outcome and stable fallback on failure", () => {
    const busy = beginMatch(initialMatchState());
    expect(
      settleMatch(busy, busy.generation, result("completed", [rec()])).rows,
    ).toHaveLength(1);
    expect(
      settleMatch(busy, busy.generation, result("no_candidates")).outcome,
    ).toBe("no_candidates");
    expect(failMatch(busy, busy.generation).error).toBe(fallbackCopy);
  });
  it("preserves usable rows after transient failures but clears on no candidates", () => {
    const initial = beginMatch(initialMatchState());
    const completed = settleMatch(
      initial,
      initial.generation,
      result("completed", [rec()]),
    );
    const regeneration = beginMatch(completed);
    const transient = settleMatch(
      regeneration,
      regeneration.generation,
      result("embedding_failed"),
    );
    expect(transient.rows).toEqual(completed.rows);
    expect(transient.error).toBe(fallbackCopy);
    const next = beginMatch(transient);
    expect(
      settleMatch(next, next.generation, result("no_candidates")).rows,
    ).toEqual([]);
  });
  it("rotates match key after deliberate successful regeneration", () => {
    const first = beginMatch(initialMatchState());
    const complete = settleMatch(
      first,
      first.generation,
      result("no_candidates"),
    );
    expect(beginMatch(complete).operationKey).not.toBe(first.operationKey);
  });
  it("caps results and exposes compact evidence warnings", () => {
    expect(
      visibleRecommendations([1, 2, 3, 4, 5, 6].map((i) => rec(i))).length,
    ).toBe(5);
    expect(recommendationWarnings(rec())).toEqual(["condition evidence"]);
  });
  // ai2-match records these five warnings on every recommendation today.
  const allMissing = [
    "Delivery timing unavailable",
    "Location evidence unavailable",
    "Transfer and repair costs unavailable",
    "Diverted fraction unavailable",
    "Avoided-emissions evidence unavailable",
  ];
  it("judges strength against the rank the recorded evidence can reach", () => {
    // Missing optional factors add nothing, so the cap drops from 100 to 60.
    expect(achievableRankScore([])).toBe(100);
    expect(achievableRankScore(allMissing)).toBe(60);
    expect(achievableRankScore(["Delivery timing unavailable"])).toBe(85);
    // Location is a compatibility input, not a rank factor: no effect on the cap.
    expect(achievableRankScore(["Location evidence unavailable"])).toBe(100);
  });
  it("no longer labels every evidence-limited recommendation weak", () => {
    // Typical case: compatibility 81 -> rank 0.60 x 81 = 48.6, the old rule
    // (rank < 60) called it weak although 48.6 of a possible 60 is strong.
    const strong = { finalRankScore: 48.6, missingEvidence: allMissing };
    expect(evidenceAdjustedScore(strong)).toBeCloseTo(81);
    expect(isWeakRecommendation(strong)).toBe(false);
    // With all optional evidence missing, the threshold equals compatibility 60.
    expect(
      isWeakRecommendation({
        finalRankScore: 35.99,
        missingEvidence: allMissing,
      }),
    ).toBe(true);
    expect(
      isWeakRecommendation({ finalRankScore: 36, missingEvidence: allMissing }),
    ).toBe(false);
  });
  it("keeps the design threshold of rank 60 when all evidence is present", () => {
    expect(
      isWeakRecommendation({ finalRankScore: 59.99, missingEvidence: [] }),
    ).toBe(true);
    expect(
      isWeakRecommendation({ finalRankScore: 60, missingEvidence: [] }),
    ).toBe(false);
  });
  it("treats unrecognised warnings conservatively", () => {
    // Unknown wording does not lower the cap, so the adjusted score stays low.
    expect(
      isWeakRecommendation({
        finalRankScore: 48.6,
        missingEvidence: ["Some new warning"],
      }),
    ).toBe(true);
  });
  it("clamps quantities and maps accepted/rejected decisions to exact RPC envelope", () => {
    expect(clampReviewQty(2001, 20, 9)).toBe(9);
    expect(clampReviewQty(4.8, 3, 10)).toBe(3);
    expect(
      reviewPayload({
        operationKey: "stable",
        recommendationId: "r",
        decision: "accepted",
        qty: 1,
      }),
    ).toEqual({
      p_input: {
        operationKey: "stable",
        recommendationId: "r",
        decision: "accepted",
        qty: 1,
      },
    });
    expect(
      reviewPayload({
        operationKey: "stable",
        recommendationId: "r",
        decision: "rejected",
      }).p_input.decision,
    ).toBe("rejected");
  });
});
