import { uuid } from "../foundation/validation.ts";

export type Snapshot = {
  snapshot_id: string;
  facts: Record<string, unknown>;
  context?: unknown;
  [key: string]: unknown;
};
export interface Ai5Gateway {
  authenticate(token: string, apiKey: string): Promise<unknown>;
  context(token: string, snapshotId: string): Promise<Snapshot>;
  save(
    token: string,
    snapshotId: string,
    idempotencyKey: string,
    model: string,
    summary: string,
    metadata: Record<string, unknown>,
  ): Promise<unknown>;
}
export type Provider = (payload: Record<string, unknown>) => Promise<unknown>;
const MODEL = "gemini-3.5-flash-lite";
const FACT_KEYS = [
  "requests_submitted",
  "open_requests",
  "completed_transfers",
  "units_successfully_transferred",
];
const numberWords =
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\b/i;
const monthNames =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
export function validateSummary(
  value: unknown,
  facts: Record<string, unknown>,
): value is { summary: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (
    Object.keys(obj).length !== 1 ||
    Object.keys(obj)[0] !== "summary" ||
    typeof obj.summary !== "string" ||
    !obj.summary.trim() ||
    obj.summary.length > 600
  )
    return false;
  const s = obj.summary;
  if (
    numberWords.test(s) ||
    monthNames.test(s) ||
    /[%$€£]|\b(?:percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided)\b/i.test(
      s,
    )
  )
    return false;
  if (/[+*/=<>^]|\bminus\b|\bplus\b|\bdivided by\b|\btimes\b/i.test(s))
    return false;
  if (
    /\d/.test(s) &&
    /(?:\d\s*[.,]\s*\d|\d\s*[-–—]\s*\d|\d+\s+to\s+\d+|\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d+(?:st|nd|rd|th)\b|[+*/=<>^]|\b(?:minus|plus|divided|times)\b)/i.test(
      s,
    )
  )
    return false;
  const permitted = new Set(
    FACT_KEYS.map((k) => facts[k])
      .filter(Number.isInteger)
      .map(String),
  );
  const tokens = s.match(/\d+/g) ?? [];
  return (
    tokens.every((n) => permitted.has(n)) &&
    !/(?:\b\d+\s*(?:kg|g|tonnes?|co2|usd|aed)\b)/i.test(s)
  );
}

export function createAi5GenerateHandler(config: {
  gateway: Ai5Gateway;
  provider: Provider;
  allowedOrigins: string[];
  providerTimeoutMs?: number;
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
    let input: any;
    try {
      const raw = await req.text();
      if (raw.length > 4000) throw 0;
      input = JSON.parse(raw);
    } catch {
      return json({ error: { code: "validation" } }, 400);
    }
    if (
      !input ||
      Object.keys(input).some(
        (k) => !["snapshotId", "idempotencyKey"].includes(k),
      ) ||
      !isUuid(input.snapshotId) ||
      !isUuid(input.idempotencyKey)
    )
      return json({ error: { code: "validation" } }, 400);
    try {
      await config.gateway.authenticate(token, key);
    } catch {
      return json({ error: { code: "unauthorized" } }, 401);
    }
    let snapshot: Snapshot;
    try {
      snapshot = await config.gateway.context(token, input.snapshotId);
    } catch {
      return json({ error: { code: "validation" }, snapshot: null }, 400);
    }
    const responseBase = { snapshot };
    try {
      const facts: Record<string, unknown> = {};
      for (const k of FACT_KEYS) {
        const n = snapshot.facts?.[k];
        if (!Number.isSafeInteger(n) || (n as number) < 0)
          throw Error("validation");
        facts[k] = n;
      }
      const payload = {
        model: MODEL,
        input: `Write a concise factual summary from these four facts only: ${JSON.stringify(facts)}. Period and schema/calculation metadata: ${JSON.stringify({ period_start: snapshot.period_start, period_end: snapshot.period_end, captured_at: snapshot.captured_at, schema_version: snapshot.schema_version, calculation_version: snapshot.calculation_version })}. Do not add numeric values, dates, percentages, ranges, arithmetic, impact/savings/emissions claims, or number words (including ordinals).`,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: { summary: { type: "string", maxLength: 600 } },
            required: ["summary"],
            additionalProperties: false,
          },
        },
      };
      const result = await Promise.race([
        config.provider(payload),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(Object.assign(Error("timeout"), { category: "timeout" })),
            config.providerTimeoutMs ?? 20000,
          ),
        ),
      ]);
      const steps = (result as any)?.steps;
      if ((result as any)?.status !== "completed" || !Array.isArray(steps))
        throw Object.assign(Error("malformed"), { category: "malformed" });
      const blocks = steps
        .flatMap((step: any) =>
          Array.isArray(step?.content) ? step.content : [],
        )
        .filter(
          (block: any) =>
            block?.type === "text" && typeof block.text === "string",
        );
      const text = blocks.length === 1 ? blocks[0].text : undefined;
      if (typeof text !== "string")
        throw Object.assign(Error("malformed"), { category: "malformed" });
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw Object.assign(Error("malformed"), { category: "malformed" });
      }
      if (!validateSummary(parsed, facts))
        throw Object.assign(Error("malformed"), { category: "malformed" });
      const saved = await config.gateway.save(
        token,
        input.snapshotId,
        input.idempotencyKey,
        MODEL,
        parsed.summary,
        {
          provider: "google-interactions",
          contract: "interactions-rest-v1",
          response_format: "application/json",
          ...(typeof (result as any)?.id === "string" &&
          (result as any).id.length <= 256
            ? { provider_interaction_id: (result as any).id }
            : {}),
        },
      );
      return json({ ...responseBase, summary: parsed.summary, report: saved });
    } catch (e) {
      const err = e as { category?: string; message?: string };
      const code =
        err.category ??
        (err.message === "validation"
          ? "validation"
          : /429|quota/i.test(err.message ?? "")
            ? "quota"
            : "provider");
      return json({ ...responseBase, error: { code } });
    }
  };
}
function isUuid(x: unknown) {
  try {
    uuid(x);
    return true;
  } catch {
    return false;
  }
}
