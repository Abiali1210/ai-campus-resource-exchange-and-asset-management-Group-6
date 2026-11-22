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
  MAX_REFERENCES = 5,
  // Item searches run over the whole caller-scoped catalogue, not the sample
  // sent to the model, and list up to this many records.
  MAX_SEARCH_ROWS = 2000,
  MAX_LISTED_ITEMS = 10,
  MAX_KEYWORDS = 3;

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
  /** Caller-scoped requests (workflow_workspace); failed reads must throw. */
  requests(token: string): Promise<Record<string, unknown>[]>;
  categories(token: string): Promise<Category[]>;
}
export type Provider = (payload: Record<string, unknown>) => Promise<unknown>;

const str = (v: unknown, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

const isListable = (r: Record<string, unknown>) =>
  typeof r.portionId === "string" && num(r.qty) > 0;
const toContextItem = (r: Record<string, unknown>): ContextItem => ({
  portionId: r.portionId as string,
  assetId: str(r.assetId, 64),
  name: str(r.name, 120),
  description: str(r.description, 160),
  categoryName: str(r.categoryName, 80),
  condition: str(r.condition, 20),
  departmentName: str(r.departmentName, 80),
  location: str(r.assignedLocation ?? r.physicalLocation, 80),
  qty: num(r.qty),
});

/** Reduce catalogue rows to the fields the assistant may use (no costs/values). */
export function toContextItems(rows: Record<string, unknown>[]): ContextItem[] {
  return rows.filter(isListable).slice(0, MAX_ITEMS).map(toContextItem);
}

// ---------------------------------------------------------------------------
// Deterministic item search (find_items).
//
// The model only says WHAT to look for (item words and, if the user named one,
// a department). The list itself comes from this filter over every record the
// caller can see, so the same question always lists the same records, and the
// sentence above the list is built here with the count taken from that list.
// ---------------------------------------------------------------------------

/** One searchable catalogue record: its display projection and search text. */
export interface SearchEntry {
  item: ContextItem;
  text: string;
}
export interface ItemSearch {
  keywords: string[];
  departmentName: string;
}
const STOP_WORDS = new Set(
  "a an and any anything are available do does for have i in is item items me need of on our some the there thing things to we what which with you resource resources stuff please show find list".split(
    " ",
  ),
);
/** Light singular form so "projectors", "benches", "batteries" match records. */
export function stemWord(word: string): string {
  if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word;
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
const searchText = (parts: unknown[]) =>
  ` ${words(parts.map((p) => (typeof p === "string" ? p : "")).join(" "))
    .map(stemWord)
    .join(" ")} `;

/** Index the caller-scoped catalogue (name, description, category and tags). */
export function toSearchEntries(
  rows: Record<string, unknown>[],
): SearchEntry[] {
  return rows
    .filter(isListable)
    .slice(0, MAX_SEARCH_ROWS)
    .map((r) => ({
      item: toContextItem(r),
      text: searchText([
        str(r.name, 300),
        str(r.description, 2000),
        str(r.categoryName, 200),
        ...(Array.isArray(r.tags) ? r.tags.map((t) => str(t, 80)) : []),
      ]),
    }));
}
const entriesFromItems = (items: ContextItem[]): SearchEntry[] =>
  items.map((item) => ({
    item,
    text: searchText([item.name, item.description, item.categoryName]),
  }));

/** Validate the model's search description. Null when it is not usable. */
export function parseSearch(value: unknown): ItemSearch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.keywords !== undefined && !Array.isArray(v.keywords)) return null;
  const keywords = ((v.keywords as unknown[]) ?? [])
    .filter((k): k is string => typeof k === "string")
    .map((k) => words(k).slice(0, 4).join(" ").slice(0, 40))
    .filter(Boolean);
  return {
    keywords: [...new Set(keywords)].slice(0, MAX_KEYWORDS),
    departmentName: str(v.departmentName, 80),
  };
}

export interface ItemSearchResult {
  /** Every matching record, sorted by name then record id. */
  matches: ContextItem[];
  /** Keyword phrases actually applied (stop words and department removed). */
  keywords: string[];
  /** Department filter actually applied, as the records spell it. */
  departmentName: string | null;
}

/**
 * Filter the caller-scoped catalogue. A record matches when every word of at
 * least one keyword phrase appears in its name, description, category or tags
 * (singular/plural insensitive), and it belongs to the named department.
 * A department is only applied when the question itself names it, so the model
 * cannot narrow the list on its own.
 */
export function searchItems(
  entries: SearchEntry[],
  search: ItemSearch,
  question: string,
): ItemSearchResult {
  const asked = ` ${words(question).join(" ")} `;
  const named = words(search.departmentName).join(" ");
  const known = [...new Set(entries.map((e) => e.item.departmentName))];
  let departmentName: string | null = null;
  let departmentWords = new Set<string>();
  if (named && asked.includes(` ${named} `)) {
    const match = known.find((d) => {
      const dept = words(d).join(" ");
      return dept === named || dept.startsWith(`${named} `);
    });
    departmentName = match ?? search.departmentName;
    departmentWords = new Set(words(departmentName));
  }
  const phrases = search.keywords
    .map((k) =>
      words(k)
        .filter((w) => !STOP_WORDS.has(w) && !departmentWords.has(w))
        .map(stemWord),
    )
    .filter((p) => p.length > 0);
  const matches = entries
    .filter(
      (e) =>
        departmentName === null ||
        words(e.item.departmentName).join(" ") ===
          words(departmentName).join(" "),
    )
    .filter(
      (e) =>
        phrases.length === 0 ||
        phrases.some((p) => p.every((w) => e.text.includes(w))),
    )
    .map((e) => e.item)
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.portionId.localeCompare(b.portionId),
    );
  return {
    matches,
    keywords: phrases.map((p) => p.join(" ")),
    departmentName,
  };
}

/** The sentence above an item list; its count is the list's own length. */
export function itemSearchAnswer(result: ItemSearchResult): string {
  const n = result.matches.length;
  const what = result.keywords.length
    ? ` matching ${result.keywords.map((k) => `"${k}"`).join(" or ")}`
    : "";
  const where = result.departmentName ? ` in ${result.departmentName}` : "";
  if (n === 0)
    return `I couldn't find any available catalogue items${what}${where}. Try the catalogue search with other words.`;
  const shown = Math.min(n, MAX_LISTED_ITEMS);
  return [
    `I found ${n} available catalogue ${n === 1 ? "item" : "items"}${what}${where}.`,
    n > shown
      ? `Here are the first ${shown}; use the catalogue search to see them all.`
      : n === 1
        ? "See the record below."
        : "See each record below.",
  ].join(" ");
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
    /** Whole caller-scoped catalogue for item searches; defaults to items. */
    catalogue?: SearchEntry[];
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

  // Item searches: the model describes the search, this code runs it and
  // writes the sentence, so the list is complete and the count always matches.
  // The model's own answer text and item picks are not shown.
  const search = intent === "find_items" ? parseSearch(v.search) : null;
  if (search) {
    const result = searchItems(
      ctx.catalogue ?? entriesFromItems(ctx.items),
      search,
      question,
    );
    return {
      intent,
      answer: itemSearchAnswer(result),
      grounded: true,
      items: result.matches.slice(0, MAX_LISTED_ITEMS),
      requests: [],
      draft: null,
    };
  }

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

  // IDs and allowed numbers cannot verify a prose claim such as "approved".
  // Let the model select records, then display their actual status/quantities
  // in the existing request cards with a deterministic introduction.
  if (intent === "request_status") {
    if (okRequests.length === 0 && ctx.requests.length > 0) return null;
    return {
      intent,
      answer: okRequests.length
        ? "Here are the current statuses of the selected requests. See each record below."
        : "No requests are visible to your account.",
      grounded: true,
      items: [],
      requests: okRequests,
      draft: null,
    };
  }

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
    // Without a usable search the model's picks are listed, but the sentence
    // is still built from the list so its count cannot disagree with it.
    answer:
      intent === "find_items"
        ? itemSearchAnswer({
            matches: okItems,
            keywords: [],
            departmentName: null,
          })
        : answer,
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
    "Intents: find_items (the user is looking for catalogue items), request_status (explain the user's requests in requestIds), draft_request (the user wants to ask for a resource: fill draft using a category name from the categories list), workflow_action (the user asks you to approve/reserve/transfer/dispose/cancel or otherwise act), unknown.",
    "For find_items, describe the search in 'search' and leave itemIds empty: the app lists every matching record itself. search.keywords: one to three short singular words for the kind of item wanted (for example 'projector'), preferring words used in the records, and no department, condition or quantity words; leave it empty if the user wants anything. search.departmentName: the department the user named, spelled as in the records; omit it if the user named none.",
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
          search: {
            type: "object",
            properties: {
              keywords: {
                type: "array",
                items: { type: "string", maxLength: 40 },
                maxItems: MAX_KEYWORDS,
              },
              departmentName: { type: "string", maxLength: 80 },
            },
            required: ["keywords"],
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

/**
 * Provider failures worth one more attempt: Google's 5xx answers, chiefly
 * 503 UNAVAILABLE ("model overloaded"), which come back within 1-3 s and
 * usually succeed on the next call. Quota (429), configuration errors and
 * timeouts are not retried: a retry cannot fix them or would not fit the time
 * budget.
 */
export function isTransientProviderError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /^provider_(500|502|503|504)$/.test(message);
}

// ---------------------------------------------------------------------------
// Log normalization. Operational logs contain ONLY values from these closed
// lists: never an error message, prompt, answer, token, header or response
// text, whatever a provider or library puts into an error.
// ---------------------------------------------------------------------------
const STATUS_CAUSES = new Set([
  "provider_400",
  "provider_401",
  "provider_403",
  "provider_404",
  "provider_429",
  "provider_500",
  "provider_502",
  "provider_503",
  "provider_504",
]);
export type ProviderFailureCause =
  | "provider_400"
  | "provider_401"
  | "provider_403"
  | "provider_404"
  | "provider_429"
  | "provider_500"
  | "provider_502"
  | "provider_503"
  | "provider_504"
  | "provider_other_status"
  | "unconfigured"
  | "timeout"
  | "network"
  | "unknown";
/** Fixed, non-sensitive category for a provider failure. */
export function providerFailureCause(error: unknown): ProviderFailureCause {
  const e = error as { category?: unknown; message?: unknown; name?: unknown };
  const message = typeof e?.message === "string" ? e.message : "";
  const name = typeof e?.name === "string" ? e.name : "";
  if (e?.category === "timeout" || name === "TimeoutError") return "timeout";
  if (STATUS_CAUSES.has(message)) return message as ProviderFailureCause;
  if (/^provider_\d{3}$/.test(message)) return "provider_other_status";
  if (message === "provider_unconfigured") return "unconfigured";
  if (name === "AbortError" || name === "TypeError") return "network";
  return "unknown";
}
const GOOGLE_STATUSES = new Set([
  "INVALID_ARGUMENT",
  "FAILED_PRECONDITION",
  "OUT_OF_RANGE",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "RESOURCE_EXHAUSTED",
  "CANCELLED",
  "INTERNAL",
  "UNAVAILABLE",
  "DEADLINE_EXCEEDED",
]);
/** Google's symbolic error status if it is a known one, otherwise "other". */
export function googleStatusCategory(status: unknown): string {
  return typeof status === "string" && GOOGLE_STATUSES.has(status)
    ? status
    : "other";
}
/** Fetch failure kind for logs: timeout, abort, network or other. */
export function fetchFailureCategory(error: unknown): string {
  const name = (error as { name?: unknown })?.name;
  return name === "TimeoutError"
    ? "timeout"
    : name === "AbortError"
      ? "abort"
      : name === "TypeError"
        ? "network"
        : "other";
}

export function createAi4AssistantHandler(config: {
  gateway: Ai4Gateway;
  provider: Provider;
  allowedOrigins: string[];
  providerTimeoutMs?: number;
  /** Pause before the single retry of a transient provider failure. */
  retryBackoffMs?: number;
  now?: () => Date;
  /** Operational log: codes and counts only, never prompts or answers. */
  log?: (line: string) => void;
}) {
  const log = config.log ?? ((line: string) => console.log(line));
  const backoffMs = config.retryBackoffMs ?? 800;
  async function callProvider(payload: Record<string, unknown>) {
    try {
      return await config.provider(payload);
    } catch (e) {
      if (!isTransientProviderError(e)) throw e;
      log(
        `ai4 provider retry cause=${providerFailureCause(e)} backoff_ms=${backoffMs}`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return await config.provider(payload);
    }
  }
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
        config.gateway.requests(token),
        config.gateway.categories(token),
      ]);
      ctx = {
        items: toContextItems(catalogue),
        catalogue: toSearchEntries(catalogue),
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
      // The time budget covers both attempts.
      const result = await Promise.race([
        callProvider(buildPrompt(question, ctx, today)),
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
      // Response and log codes come from a fixed list only.
      const cause = providerFailureCause(e);
      const code =
        cause === "timeout"
          ? "timeout"
          : cause === "provider_429"
            ? "quota"
            : cause === "unconfigured"
              ? "unconfigured"
              : "provider";
      log(`ai4 provider outcome=error code=${code} cause=${cause}`);
      return json({ error: { code } });
    }
  };
}
