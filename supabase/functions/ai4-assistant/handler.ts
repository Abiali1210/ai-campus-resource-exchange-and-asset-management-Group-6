// AI #4 — Circular campus assistant.
//
// Answers natural-language questions using ONLY records the signed-in caller can
// already read (catalogue + their workflow requests). Every model answer is
// re-checked here before it reaches the browser: referenced records must exist
// in the supplied context, and the text may not introduce identifiers or numbers
// that the records/question do not contain. Anything ungrounded collapses to
// "I don't know". The assistant never writes data: request drafts and workflow
// actions are returned as suggestions that the UI opens in the normal forms.

export const MODEL = "gemini-3.5-flash-lite";
export const DONT_KNOW =
  "I don't know. I couldn't find that in the records you can see. Try the catalogue search or the Requests and transfers page.";
export const REFUSAL =
  "I can't approve, reserve, transfer or dispose of anything. Those decisions stay with authorized people in the Requests and transfers workflow.";
const INTENTS = [
  "find_items",
  "request_status",
  "draft_request",
  "workflow_action",
  "unknown",
] as const;
export type Intent = (typeof INTENTS)[number];
const URGENCIES = ["Low", "Normal", "High"] as const;
const MAX_ITEMS = 60,
  MAX_REQUESTS = 30,
  MAX_REFERENCES = 5;

/** Compact, non-financial catalogue projection sent to the model. */
export interface ContextItem {
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
/** Compact projection of a request the caller can already see. */
export interface ContextRequest {
  requestId: string;
  purpose: string;
  status: string;
  urgency: string;
  requestedQty: number;
  remainingQty: number;
  requiredDate: string;
}
export interface Category {
  categoryId: string;
  name: string;
}
export interface RequestDraft {
  purpose: string;
  categoryId: string | null;
  categoryName: string;
  qty: number;
  urgency: (typeof URGENCIES)[number];
}
export interface AssistantReply {
  intent: Intent;
  answer: string;
  grounded: boolean;
  items: ContextItem[];
  requests: ContextRequest[];
  draft: RequestDraft | null;
  model: string | null;
}

export interface Ai4Gateway {
  authenticate(token: string, apiKey: string): Promise<unknown>;
  /** Caller-scoped published catalogue (search_assets). */
  catalogue(token: string): Promise<Record<string, unknown>[]>;
  /** Caller-scoped requests (workflow_workspace); empty when not permitted. */
  requests(token: string): Promise<Record<string, unknown>[]>;
  categories(token: string): Promise<Category[]>;
}
export type Provider = (payload: Record<string, unknown>) => Promise<unknown>;

const str = (v: unknown, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** Reduce catalogue rows to the fields the assistant may use (no costs/values). */
export function toContextItems(rows: Record<string, unknown>[]): ContextItem[] {
  return rows
    .filter((r) => typeof r.portionId === "string" && num(r.qty) > 0)
    .slice(0, MAX_ITEMS)
    .map((r) => ({
      portionId: r.portionId as string,
      assetId: str(r.assetId, 64),
      name: str(r.name, 120),
      description: str(r.description, 160),
      categoryName: str(r.categoryName, 80),
      condition: str(r.condition, 20),
      departmentName: str(r.departmentName, 80),
      location: str(r.assignedLocation ?? r.physicalLocation, 80),
      qty: num(r.qty),
    }));
}
export function toContextRequests(
  rows: Record<string, unknown>[],
): ContextRequest[] {
  return rows
    .filter((r) => typeof r.requestId === "string")
    .slice(0, MAX_REQUESTS)
    .map((r) => ({
      requestId: r.requestId as string,
      purpose: str(r.purpose, 160),
      status: str(r.status, 40),
      urgency: str(r.urgency, 10),
      requestedQty: num(r.requestedQty),
      remainingQty: num(r.remainingQty),
      requiredDate: str(r.requiredDate, 10),
    }));
}

/**
 * Deterministic guard: imperative requests to perform workflow decisions are
 * refused without calling the model (FR-ASSIST-004, BR-002).
 */
export function isWorkflowCommand(question: string): boolean {
  return /^\s*(?:please\s+|can you\s+|could you\s+|would you\s+|i want you to\s+)?(?:approve|reject|reserve|release|dispatch|dispose|delete|remove|cancel|withdraw|publish|transfer|confirm|accept|mark|assign|recycle|donate|retire)\b/i.test(
    question,
  );
}

const UUID_TEXT =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/**
 * Validate the model's structured output against the supplied context.
 * Returns null when anything is ungrounded, so the caller answers "I don't know".
 */
export function groundReply(
  value: unknown,
  ctx: {
    items: ContextItem[];
    requests: ContextRequest[];
    categories: Category[];
  },
  question: string,
): Omit<AssistantReply, "model"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!INTENTS.includes(v.intent as Intent)) return null;
  const intent = v.intent as Intent;
  if (intent === "workflow_action") return refusalReply();
  const answer = typeof v.answer === "string" ? v.answer.trim() : "";
  if (!answer || answer.length > 500 || UUID_TEXT.test(answer)) return null;

  const ids = (x: unknown) =>
    Array.isArray(x)
      ? [...new Set(x.filter((i) => typeof i === "string"))]
      : null;
  const itemIds = ids(v.itemIds),
    requestIds = ids(v.requestIds);
  if (!itemIds || !requestIds) return null;
  if (itemIds.length > MAX_REFERENCES || requestIds.length > MAX_REFERENCES)
    return null;
  const items = itemIds.map((id) => ctx.items.find((i) => i.portionId === id));
  const requests = requestIds.map((id) =>
    ctx.requests.find((r) => r.requestId === id),
  );
  // Any reference to a record the caller was not given is a hallucination.
  if (items.some((i) => !i) || requests.some((r) => !r)) return null;
  const okItems = items as ContextItem[],
    okRequests = requests as ContextRequest[];

  // Numbers in the answer must come from the question or referenced records.
  // Digits inside names/locations/dates (e.g. "Room 12") only count when the
  // whole phrase is quoted, so they can't be reused as invented quantities.
  const permitted = new Set<number>([okItems.length, okRequests.length]);
  for (const n of question.match(/\d+/g) ?? []) permitted.add(Number(n));
  for (const i of okItems) permitted.add(i.qty);
  for (const r of okRequests) {
    permitted.add(r.requestedQty);
    permitted.add(r.remainingQty);
  }
  let checked = answer;
  const phrases = [
    ...okItems.flatMap((i) => [i.name, i.location]),
    ...okRequests.flatMap((r) => [r.purpose, r.requiredDate]),
  ]
    .filter((p) => /\d/.test(p))
    .sort((a, b) => b.length - a.length);
  for (const p of phrases) checked = checked.split(p).join(" ");
  for (const n of checked.match(/\d+/g) ?? [])
    if (!permitted.has(Number(n))) return null;

  if (intent === "unknown")
    return {
      intent,
      answer: DONT_KNOW,
      grounded: true,
      items: [],
      requests: [],
      draft: null,
    };
  if (intent === "find_items" && okItems.length === 0)
    return {
      intent: "unknown",
      answer: DONT_KNOW,
      grounded: true,
      items: [],
      requests: [],
      draft: null,
    };

  let draft: RequestDraft | null = null;
  if (intent === "draft_request") {
    const d =
      v.draft && typeof v.draft === "object" && !Array.isArray(v.draft)
        ? (v.draft as Record<string, unknown>)
        : null;
    if (!d) return null;
    const categoryName = str(d.categoryName, 80);
    const category = ctx.categories.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    const qty =
      Number.isInteger(d.quantity) &&
      (d.quantity as number) >= 1 &&
      (d.quantity as number) <= 1000
        ? (d.quantity as number)
        : 1;
    draft = {
      purpose: str(d.purpose, 200) || question.trim().slice(0, 200),
      categoryId: category?.categoryId ?? null,
      categoryName: category?.name ?? "",
      qty,
      urgency: URGENCIES.includes(d.urgency as never)
        ? (d.urgency as RequestDraft["urgency"])
        : "Normal",
    };
  }
  return {
    intent,
    answer,
    grounded: true,
    items: okItems,
    requests: okRequests,
    draft,
  };
}

function refusalReply(): Omit<AssistantReply, "model"> {
  return {
    intent: "workflow_action",
    answer: REFUSAL,
    grounded: true,
    items: [],
    requests: [],
    draft: null,
  };
}

export function buildPrompt(
  question: string,
  ctx: {
    items: ContextItem[];
    requests: ContextRequest[];
    categories: Category[];
  },
  today: string,
): Record<string, unknown> {
  const instructions = [
    "You are the Circular Campus Exchange assistant for a university resource-reuse app.",
    "Use ONLY the JSON records below. They are everything the user is allowed to see.",
    "Never invent items, requests, quantities, dates, prices or policies.",
    "If the records do not answer the question, set intent to 'unknown'.",
    "Intents: find_items (list matching catalogue items in itemIds), request_status (explain the user's requests in requestIds), draft_request (the user wants to ask for a resource: fill draft using a category name from the categories list), workflow_action (the user asks you to approve/reserve/transfer/dispose/cancel or otherwise act), unknown.",
    "You cannot perform actions. For draft_request, the user reviews and submits the form themselves.",
    "Put record ids ONLY in itemIds/requestIds, never in the answer text. Reference at most 5 of each.",
    "Keep the answer to one or two short, friendly sentences. Only use numbers that appear in the records or the question.",
    `Today is ${today}.`,
  ].join("\n");
  const data = {
    categories: ctx.categories.map((c) => c.name),
    items: ctx.items.map(({ assetId: _a, ...rest }) => rest),
    myRequests: ctx.requests,
  };
  return {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Records: ${JSON.stringify(data)}\n\nQuestion: ${question}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      // Lookup over supplied records needs no long reasoning; minimal thinking
      // keeps answers fast (about 1.5-2.5 s on the hosted project).
      thinkingConfig: { thinkingLevel: "minimal" },
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          intent: { type: "string", enum: [...INTENTS] },
          answer: { type: "string", maxLength: 500 },
          itemIds: { type: "array", items: { type: "string" }, maxItems: 5 },
          requestIds: {
            type: "array",
            items: { type: "string" },
            maxItems: 5,
          },
          draft: {
            type: "object",
            properties: {
              purpose: { type: "string" },
              categoryName: { type: "string" },
              quantity: { type: "integer" },
              urgency: { type: "string", enum: [...URGENCIES] },
            },
            required: ["purpose", "categoryName", "quantity", "urgency"],
          },
        },
        required: ["intent", "answer", "itemIds", "requestIds"],
      },
    },
  };
}

export function createAi4AssistantHandler(config: {
  gateway: Ai4Gateway;
  provider: Provider;
  allowedOrigins: string[];
  providerTimeoutMs?: number;
  now?: () => Date;
}) {
  return async (req: Request) => {
    const origin = req.headers.get("origin"),
      allowed = !origin || config.allowedOrigins.includes(origin);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      Vary: "Origin",
    });
    if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v), { status, headers });
    if (!allowed) return json({ error: { code: "forbidden" } }, 403);
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST")
      return json({ error: { code: "validation" } }, 405);
    const auth = req.headers.get("authorization") || "",
      key = req.headers.get("apikey") || "";
    if (!/^Bearer\s+\S+$/i.test(auth) || !key.startsWith("sb_publishable_"))
      return json({ error: { code: "unauthorized" } }, 401);
    const token = auth.replace(/^Bearer\s+/i, "");

    let question: string;
    try {
      const raw = await req.text();
      if (raw.length > 2000) throw 0;
      const input = JSON.parse(raw);
      if (
        !input ||
        typeof input !== "object" ||
        Object.keys(input).some((k) => k !== "question") ||
        typeof input.question !== "string" ||
        !input.question.trim() ||
        input.question.length > 500
      )
        throw 0;
      question = input.question.trim();
    } catch {
      return json({ error: { code: "validation" } }, 400);
    }
    try {
      await config.gateway.authenticate(token, key);
    } catch {
      return json({ error: { code: "unauthorized" } }, 401);
    }
    if (isWorkflowCommand(question))
      return json({ ...refusalReply(), model: null });

    let ctx;
    try {
      const [catalogue, requests, categories] = await Promise.all([
        config.gateway.catalogue(token),
        config.gateway.requests(token).catch(() => []),
        config.gateway.categories(token),
      ]);
      ctx = {
        items: toContextItems(catalogue),
        requests: toContextRequests(requests),
        categories: categories.filter(
          (c) =>
            typeof c?.categoryId === "string" && typeof c?.name === "string",
        ),
      };
    } catch {
      return json({ error: { code: "context" } });
    }

    try {
      const today = (config.now?.() ?? new Date()).toISOString().slice(0, 10);
      const result = await Promise.race([
        config.provider(buildPrompt(question, ctx, today)),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(Object.assign(Error("timeout"), { category: "timeout" })),
            config.providerTimeoutMs ?? 20000,
          ),
        ),
      ]);
      const candidate = (result as any)?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      let parsed: unknown = null;
      if (candidate?.finishReason === "STOP" && typeof text === "string") {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }
      const grounded = groundReply(parsed, ctx, question);
      if (!grounded)
        return json({
          intent: "unknown",
          answer: DONT_KNOW,
          grounded: false,
          items: [],
          requests: [],
          draft: null,
          model: MODEL,
        } satisfies AssistantReply);
      return json({ ...grounded, model: MODEL } satisfies AssistantReply);
    } catch (e) {
      const err = e as { category?: string; message?: string };
      const code =
        err.category ??
        (/429|quota/i.test(err.message ?? "")
          ? "quota"
          : /unconfigured/.test(err.message ?? "")
            ? "unconfigured"
            : "provider");
      return json({ error: { code } });
    }
  };
}
