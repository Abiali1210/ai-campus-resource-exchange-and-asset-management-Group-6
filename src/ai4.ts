// Client side of AI #4 (campus assistant). The Edge Function does the
// grounding; this module only calls it and turns failures into a clear
// "use the normal screens" message (FR-ASSIST-005).
import { ServiceError } from "./api";

export type AssistantIntent =
  | "find_items"
  | "request_status"
  | "draft_request"
  | "workflow_action"
  | "unknown";
export interface AssistantItem {
  portionId: string;
  assetId: string;
  name: string;
  description: string;
  categoryName: string;
  condition: string;
  departmentName: string;
  location: string;
  qty: number;
}
export interface AssistantRequest {
  requestId: string;
  purpose: string;
  status: string;
  urgency: string;
  requestedQty: number;
  remainingQty: number;
  requiredDate: string;
}
export interface RequestDraft {
  purpose: string;
  categoryId: string | null;
  categoryName: string;
  qty: number;
  urgency: "Low" | "Normal" | "High";
}
export interface AssistantReply {
  intent: AssistantIntent;
  answer: string;
  grounded: boolean;
  items: AssistantItem[];
  requests: AssistantRequest[];
  draft: RequestDraft | null;
  model: string | null;
}

const FALLBACK =
  "You can keep going with the catalogue search and the Requests and transfers page.";
export const ASSISTANT_ERRORS: Record<string, string> = {
  timeout: `The assistant took too long to answer. ${FALLBACK}`,
  quota: `The assistant is busy right now (AI quota reached). ${FALLBACK}`,
  provider: `The assistant is unavailable right now. ${FALLBACK}`,
  unconfigured: `The assistant isn't configured on this server. ${FALLBACK}`,
  context: `The assistant couldn't load your records. ${FALLBACK}`,
  validation: "Please ask a question of up to 500 characters.",
  unauthorized: "Your session has expired. Sign in again to use the assistant.",
};
export function assistantErrorMessage(code: string): string {
  return ASSISTANT_ERRORS[code] ?? ASSISTANT_ERRORS.provider;
}

/** Shape check so a malformed function response never renders as an answer. */
export function isAssistantReply(x: unknown): x is AssistantReply {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.answer === "string" &&
    typeof r.intent === "string" &&
    Array.isArray(r.items) &&
    Array.isArray(r.requests)
  );
}

export const ASSISTANT_SUGGESTIONS = [
  "Are there any monitors available?",
  "What's the status of my requests?",
  "I need 4 chairs for a lab next month",
];

type Invoke = (
  name: string,
  options: { body: unknown },
) => Promise<{ data: any; error: any }>;

export async function askAssistant(
  invoke: Invoke,
  question: string,
): Promise<AssistantReply> {
  const trimmed = question.trim();
  if (!trimmed || trimmed.length > 500)
    throw new ServiceError(assistantErrorMessage("validation"), "validation");
  let result: { data: any; error: any };
  try {
    result = await invoke("ai4-assistant", { body: { question: trimmed } });
  } catch {
    throw new ServiceError(assistantErrorMessage("provider"), "provider");
  }
  const { data, error } = result;
  if (error) {
    let code = "provider";
    try {
      const body = await error.context?.json?.();
      if (typeof body?.error?.code === "string") code = body.error.code;
    } catch {
      /* network failure: no body */
    }
    throw new ServiceError(assistantErrorMessage(code), code);
  }
  if (data?.error?.code)
    throw new ServiceError(
      assistantErrorMessage(String(data.error.code)),
      String(data.error.code),
    );
  if (!isAssistantReply(data))
    throw new ServiceError(assistantErrorMessage("provider"), "provider");
  return data;
}
