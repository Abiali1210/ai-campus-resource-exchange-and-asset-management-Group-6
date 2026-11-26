import { uuid } from "../foundation/validation.ts";

export type Snapshot = {
  snapshot_id: string;
  facts: Record<string, unknown>;
  context?: unknown;
  [key: string]: unknown;
};
export interface Ai5Gateway {
  authenticate(token: string, apiKey: string): Promise<unknown>;
  replay(
    token: string,
    snapshotId: string,
    key: string,
  ): Promise<{ snapshot: Snapshot; report: unknown } | null>;
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
const V2_FACT_KEYS = [
  ...FACT_KEYS,
  "non_open_requests",
  "open_request_rate_percent",
  "units_per_completed_transfer",
];
const numberWords =
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\b/i;
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

export function compileV2Narrative(
  value: unknown,
  facts: Record<string, unknown>,
): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = [
    "headline",
    "demand",
    "transferActivity",
    "interpretation",
    "limitation",
  ];
  if (
    Object.keys(input).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(input, key))
  )
    return null;
  const fields: Record<string, string> = {};
  for (const key of keys) {
    if (typeof input[key] !== "string") return null;
    const field = (input[key] as string).trim().replace(/\s+/g, " ");
    if (!field || field.length > 180) return null;
    fields[key] = field;
  }
  const sections = [
    `Headline: ${fields.headline}`,
    `Demand: ${fields.demand}`,
    `Transfer activity: ${fields.transferActivity}`,
    `Interpretation: ${fields.interpretation}`,
    `Limitation: ${fields.limitation}`,
  ];
  const output = sections.join("\n");
  if (output.length > 600) return null;
  if (/[$€£]/.test(output)) return null;
  if (/[-+]\s*\d|\d\s*[eE][+-]?\d/.test(output)) return null;
  if (
    /\b(?:sustainability|emissions?|savings?|waste|cost|maintenance|forecast|recommendation)\b/i.test(
      output,
    )
  )
    return null;
  const tokens = output.match(/\d+(?:\.\d+)?%?/g) ?? [];
  for (const token of tokens) {
    if (token.endsWith("%")) {
      const numericToken = Number(token.slice(0, -1));
      if (!Number.isFinite(numericToken) || numericToken !== Number(facts.open_request_rate_percent)) return null;
    } else {
      const numericToken = Number(token);
      if (!Number.isFinite(numericToken) || !V2_FACT_KEYS.some((key) =>
        typeof facts[key] === "number" && Number.isFinite(facts[key]) && numericToken === facts[key],
      )) return null;
    }
  }
  if (
    (output.match(/%/g) ?? []).length !==
    tokens.filter((token) => token.endsWith("%")).length
  )
    return null;
  return output;
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
    try {
      const replay = await config.gateway.replay(
        token,
        input.snapshotId,
        input.idempotencyKey,
      );
      if (replay)
        return json({
          snapshot: replay.snapshot,
          report: replay.report,
          replay: true,
        });
    } catch {
      return json({ error: { code: "validation" }, snapshot: null }, 400);
    }
    let snapshot: Snapshot;
    try {
      snapshot = await config.gateway.context(token, input.snapshotId);
    } catch {
      return json({ error: { code: "validation" }, snapshot: null }, 400);
    }
    const responseBase = { snapshot };
    let validatedFacts: Record<string, unknown> | null = null;
    const isV2 = snapshot.calculation_version === "ai5-operational-v2";
    try {
      const facts: Record<string, unknown> = {};
      const v2 = isV2;
      for (const k of v2 ? V2_FACT_KEYS : FACT_KEYS) {
        const n = snapshot.facts?.[k];
        const ratio = k === "units_per_completed_transfer";
        if (
          typeof n !== "number" ||
          !Number.isFinite(n) ||
          n < 0 ||
          (ratio ? Math.round(n * 10) !== n * 10 : !Number.isSafeInteger(n))
        )
          throw Error("validation");
        facts[k] = n;
      }
      validatedFacts = facts;
      const metadata = {
        period_start: snapshot.period_start,
        period_end: snapshot.period_end,
        captured_at: snapshot.captured_at,
        schema_version: snapshot.schema_version,
        calculation_version: snapshot.calculation_version,
      };
      const prompt = v2
        ? `Write concise, natural operational prose using only these supplied facts: ${JSON.stringify(facts)}. Return JSON with exactly five nonempty string fields: headline, demand, transferActivity, interpretation, limitation. Keep every field under 180 characters and the compiled response under 600 characters. Do not invent numeric values. Metadata for context only: ${JSON.stringify(metadata)}.`
        : `Write a concise factual summary from these four facts only: ${JSON.stringify(facts)}. Snapshot metadata (context only): ${JSON.stringify(metadata)}. Do not add numeric values, dates, percentages, ranges, arithmetic, impact/savings/emissions claims, or number words (including ordinals).`;
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: v2
            ? {
                type: "object",
                properties: Object.fromEntries(
                  [
                    "headline",
                    "demand",
                    "transferActivity",
                    "interpretation",
                    "limitation",
                  ].map((key) => [key, { type: "string", maxLength: 180 }]),
                ),
                required: [
                  "headline",
                  "demand",
                  "transferActivity",
                  "interpretation",
                  "limitation",
                ],
                additionalProperties: false,
              }
            : {
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
      const candidates = (result as any)?.candidates;
      if (
        !Array.isArray(candidates) ||
        candidates.length !== 1 ||
        candidates[0]?.finishReason !== "STOP"
      )
        throw Object.assign(Error("malformed"), { category: "malformed" });
      const parts = candidates[0]?.content?.parts;
      const text =
        Array.isArray(parts) && parts.length === 1 ? parts[0]?.text : undefined;
      if (typeof text !== "string")
        throw Object.assign(Error("malformed"), { category: "malformed" });
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw Object.assign(Error("malformed"), { category: "malformed" });
      }
      const summary =
        snapshot.calculation_version === "ai5-operational-v2"
          ? compileV2Narrative(parsed, facts)
          : validateSummary(parsed, facts)
            ? parsed.summary
            : null;
      if (!summary)
        throw Object.assign(Error("malformed"), { category: "malformed" });
      let saved;
      try {
        saved = await config.gateway.save(
          token,
          input.snapshotId,
          input.idempotencyKey,
          MODEL,
          summary,
          {
            provider: "google-generate-content",
            contract: "generate-content-v1beta",
            response_format: "application/json",
            ...(typeof (result as any)?.responseId === "string" &&
            (result as any).responseId.length <= 256
              ? { provider_response_id: (result as any).responseId }
              : {}),
            ...(typeof (result as any)?.modelVersion === "string" &&
            (result as any).modelVersion.length <= 128
              ? { model_version: (result as any).modelVersion }
              : {}),
          },
        );
      } catch {
        throw Object.assign(Error("persistence"), { category: "persistence" });
      }
      return json({ ...responseBase, summary, report: saved });
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
