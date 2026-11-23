import { supabaseClient as client } from "./api";

export type Recommendation = {
  recommendationId: string;
  portionId: string;
  assetId: string;
  rank: number;
  assetName: string;
  condition: string;
  availableQty: number;
  compatibilityScore: number;
  finalRankScore: number;
  reason: string;
  missingEvidence: string[];
  reviewState: string;
  interestId?: string;
};
export type MatchResult = {
  outcome:
    | "completed"
    | "no_candidates"
    | "request_not_eligible"
    | "embedding_failed"
    | "candidate_set_changed"
    | "internal_error";
  runId?: string;
  requestId: string;
  recommendations: Recommendation[];
  message?: string;
};
export type ReviewInput = {
  operationKey: string;
  recommendationId: string;
  decision: "accepted" | "rejected";
  note?: string;
  qty?: number;
};
export async function getRecommendations(
  requestId: string,
  operationKey: string,
): Promise<MatchResult> {
  if (!client)
    throw new Error("Connect a Supabase project to request recommendations.");
  const { data, error } = await client.functions.invoke("ai2-match", {
    body: { requestId, operationKey },
  });
  if (error)
    throw new Error(error.message || "Recommendations are unavailable.");
  return data as MatchResult;
}
export async function reviewRecommendation(
  input: ReviewInput,
): Promise<{ interestId?: string }> {
  if (!client)
    throw new Error("Connect a Supabase project to review recommendations.");
  const { data, error } = await client.rpc("ai2_review_recommendation", {
    ...reviewPayload(input),
  });
  if (error) throw new Error(error.message || "Review could not be saved.");
  const value = (data?.data ?? data) as { interestId?: string };
  return value;
}
/**
 * Match strength (design 12.1, Phase 6 polish).
 *
 * The ranking formula is unchanged: Rank = 100 x (0.60F + 0.15T + 0.10K +
 * 0.10W + 0.05E). A factor whose evidence is missing contributes 0 and its
 * weight is not redistributed, so missing evidence also caps the highest rank
 * a recommendation can reach. While timing, cost, waste and emissions evidence
 * is unavailable that cap is 60, so a fixed "rank below 60" rule labelled every
 * recommendation weak. Strength is therefore judged against the cap: the rank
 * as a percentage of the rank achievable with the evidence on record. With all
 * optional evidence missing this equals the compatibility score; with all of it
 * present it equals the rank itself.
 *
 * Each optional factor is identified by the warning ai2-match records when its
 * evidence is missing. An unrecognised warning leaves the cap higher, which
 * lowers the adjusted score, so a wording change errs towards "weak".
 */
export const WEAK_MATCH_THRESHOLD = 60;
const RANK_BASE_WEIGHT = 60;
const OPTIONAL_RANK_FACTORS = [
  { weight: 15, missing: "Delivery timing unavailable" },
  { weight: 10, missing: "Transfer and repair costs unavailable" },
  { weight: 10, missing: "Diverted fraction unavailable" },
  { weight: 5, missing: "Avoided-emissions evidence unavailable" },
];
type StrengthInput = Pick<Recommendation, "finalRankScore" | "missingEvidence">;
export function achievableRankScore(missingEvidence: string[]): number {
  return OPTIONAL_RANK_FACTORS.reduce(
    (max, f) => (missingEvidence.includes(f.missing) ? max : max + f.weight),
    RANK_BASE_WEIGHT,
  );
}
export function evidenceAdjustedScore(row: StrengthInput): number {
  const score =
    (100 * row.finalRankScore) / achievableRankScore(row.missingEvidence);
  return Math.max(0, Math.min(100, score));
}
export const isWeakRecommendation = (row: StrengthInput) =>
  evidenceAdjustedScore(row) < WEAK_MATCH_THRESHOLD;
export const visibleRecommendations = (rows: Recommendation[]) =>
  rows.slice(0, 5);
export const fallbackCopy =
  "Recommendations are temporarily unavailable. You can still search the catalogue.";
export const recommendationWarnings = (row: Recommendation) =>
  row.missingEvidence;
export type MatchState = {
  loading: boolean;
  operationKey: string;
  generation: number;
  rows: Recommendation[];
  outcome?: MatchResult["outcome"];
  error?: string;
};
export const initialMatchState = (): MatchState => ({
  loading: false,
  operationKey: "",
  generation: 0,
  rows: [],
});
export type MatchStateStore = { current: Record<string, MatchState> };
export function beginRequestMatch(
  store: MatchStateStore,
  requestId: string,
): MatchState | null {
  const prior = store.current[requestId] ?? initialMatchState();
  if (prior.loading) return null;
  const started = beginMatch(prior);
  store.current = { ...store.current, [requestId]: started };
  return started;
}
export function beginMatch(state: MatchState): MatchState {
  return state.loading
    ? state
    : {
        ...state,
        loading: true,
        operationKey:
          state.outcome === "completed" || state.outcome === "no_candidates"
            ? crypto.randomUUID()
            : state.operationKey || crypto.randomUUID(),
        generation: state.generation + 1,
        outcome: undefined,
        error: undefined,
      };
}
export function settleMatch(
  state: MatchState,
  generation: number,
  result: MatchResult,
): MatchState {
  if (generation !== state.generation) return state;
  return {
    ...state,
    loading: false,
    rows:
      result.outcome === "completed"
        ? result.recommendations
        : result.outcome === "no_candidates"
          ? []
          : state.rows,
    outcome: result.outcome,
    error:
      result.outcome === "completed" || result.outcome === "no_candidates"
        ? undefined
        : fallbackCopy,
  };
}
export function failMatch(state: MatchState, generation: number): MatchState {
  return generation === state.generation
    ? { ...state, loading: false, error: fallbackCopy }
    : state;
}
export function reviewPayload(input: ReviewInput) {
  return { p_input: input };
}
export const clampReviewQty = (
  qty: number,
  available: number,
  remaining: number,
) => Math.max(1, Math.min(1000, available, remaining, Math.floor(qty)));
