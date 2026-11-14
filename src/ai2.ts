import { createClient } from "@supabase/supabase-js";

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
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const client = url && key ? createClient(url, key) : null;
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
export const isWeakRecommendation = (score: number) => score < 60;
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
