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
  if (
    keys.some(
      (key) =>
        typeof input[key] !== "string" ||
        !(input[key] as string).trim() ||
        (input[key] as string).length > 180,
    )
  )
    return null;
  const sections = [
    `Headline: ${input.headline}`,
    `Demand: ${input.demand}`,
    `Transfer activity: ${input.transferActivity}`,
    `Interpretation: ${input.interpretation}`,
    `Limitation: ${input.limitation}`,
  ];
  const output = sections.join("\n");
  if (output.length > 600) return null;
  const demand = input.demand as string;
  const transfer = input.transferActivity as string;
  const expected = [
    facts.requests_submitted,
    facts.open_requests,
    facts.non_open_requests,
    facts.open_request_rate_percent,
  ];
  const transferExpected = [
    facts.completed_transfers,
    facts.units_successfully_transferred,
    facts.units_per_completed_transfer,
  ];
  const numericTokens = (text: string) =>
    [...text.matchAll(/\d+(?:\.\d+)?%?/g)].map((match) => match[0]);
  const exactNumbers = (text: string, values: unknown[]) => {
    const tokens = numericTokens(text).sort();
    const permitted = values.map(String);
    if (text === demand) permitted[permitted.length - 1] += "%";
    return (
      tokens.length === permitted.length &&
      tokens.join("|") === permitted.sort().join("|")
    );
  };
  if (
    !exactNumbers(demand, expected) ||
    !exactNumbers(transfer, transferExpected)
  )
    return null;
  if (
    demand.match(/\d+(?:\.\d+)?%?/g)?.filter((x) => x.endsWith("%")).length !==
      1 ||
    !demand.includes(`${facts.open_request_rate_percent}%`)
  )
    return null;
  const remainder = [
    input.headline,
    input.interpretation,
    input.limitation,
  ].join(" ");
  if (/\d|%|[$€£]/i.test(remainder)) return null;
  const safeText = output.replace(/[0-9]+(?:\.[0-9]+)?%?/g, "");
  if (
    safeText.length > 600 ||
    /[%$€£]|\b(?:percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth)\b|[+*/=<>^]/i.test(
      safeText,
    )
  )
    return null;
  if (
    /[+$€£]|[%]|\b(?:percent|percentage|date|rank|ranking|ordinal|savings?|saved|impact|emissions?|waste|utilization|maintenance|estimate|estimated|aed|usd|eur|gbp|dollars?|euros?|pounds?|reduced|avoided|zero|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|minus|plus|divided|times)\b|[+*/=<>^]/i.test(
      safeText,
    )
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
    try {
      const facts: Record<string, unknown> = {};
      const v2 = snapshot.calculation_version === "ai5-operational-v2";
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
      const metadata = {
        period_start: snapshot.period_start,
        period_end: snapshot.period_end,
        captured_at: snapshot.captured_at,
        schema_version: snapshot.schema_version,
        calculation_version: snapshot.calculation_version,
      };
      const prompt = v2
        ? `Write a concise university-administrator briefing, preferably under 700 characters, using only these supplied snapshot facts: ${JSON.stringify(facts)}. Return JSON with exactly five string fields: headline, demand, transferActivity, interpretation, limitation. Headline: neutral and useful, with no figures. Demand: explain requests_submitted, open_requests, non_open_requests, and open_request_rate_percent. Transfer activity: explain completed_transfers, units_successfully_transferred, and units_per_completed_transfer. Include each supplied value exactly in digits; do not derive, substitute, omit, or duplicate values. Use no number words or ordinals. Numeric fact order may be natural and need not match the listed order. Interpretation: compare only supplied facts and add operational meaning rather than repeating labels. Limitation: explicitly state that this snapshot cannot establish causes or future outcomes. Use direct, natural university-administrator language. No dates, currency, trends, forecasts, impact claims, recommendations, sustainability, emissions, savings, waste, cost, or maintenance claims, or invented figures. Metadata for context only: ${JSON.stringify(metadata)}.`
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
      const saved = await config.gateway.save(
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
