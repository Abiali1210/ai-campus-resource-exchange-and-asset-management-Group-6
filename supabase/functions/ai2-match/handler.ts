export type RequestSource = {
  requestId: string;
  version: number;
  category: string;
  purpose: string;
  requirements: Record<string, unknown>;
  minimumCondition: string | null;
  remainingQty: number;
};
export type Candidate = {
  portion_id: string;
  asset_id: string;
  asset_name: string;
  description: string;
  category_id: string;
  specifications: Record<string, unknown>;
  qty: number;
  condition: string;
  department_id: string;
  department_name: string;
  assigned_location: string;
  physical_location: string;
  similarity: number;
};
export interface MatchGateway {
  authenticate(token: string, apiKey: string): Promise<string>;
  source(token: string, requestId: string): Promise<RequestSource>;
  existing(
    token: string,
    requestId: string,
    operationKey: string,
  ): Promise<unknown | null>;
  candidates(
    token: string,
    requestId: string,
    vector: number[],
  ): Promise<Candidate[]>;
  save(actor: string, input: Record<string, unknown>): Promise<unknown>;
  visible(token: string, runId: string): Promise<unknown>;
}
export type Embed = (text: string) => Promise<number[]>;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const finite01 = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
export function serializeRequest(s: RequestSource): string {
  let requirementBudget = 0,
    requirementNodes = 0;
  const clean = (v: unknown, depth = 0): unknown => {
    if (++requirementNodes > 200) throw new Error("invalid_source");
    if (depth > 5) throw new Error("invalid_source");
    if (typeof v === "string") {
      const x = v.replace(/\s+/g, " ").trim();
      requirementBudget += x.length;
      if (x.length > 300 || requirementBudget > 3000)
        throw new Error("invalid_source");
      return x;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      requirementBudget += String(v).length;
      if (requirementBudget > 3000) throw new Error("invalid_source");
      return v;
    }
    if (typeof v === "boolean") {
      requirementBudget += String(v).length;
      if (requirementBudget > 3000) throw new Error("invalid_source");
      return v;
    }
    if (Array.isArray(v) || v === null || typeof v !== "object")
      throw new Error("invalid_source");
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null)
      throw new Error("invalid_source");
    const obj = v as Record<string, unknown>,
      keys = Object.keys(obj).sort();
    if (keys.length > 40) throw new Error("invalid_source");
    const out: Record<string, unknown> = {};
    const normalizedKeys = new Set<string>();
    for (const k of keys) {
      const key = k.replace(/\s+/g, " ").trim();
      if (!key || key.length > 80 || normalizedKeys.has(key))
        throw new Error("invalid_source");
      requirementBudget += key.length;
      if (requirementBudget > 3000) throw new Error("invalid_source");
      normalizedKeys.add(key);
      out[key] = clean(obj[k], depth + 1);
    }
    return out;
  };
  if (
    !s ||
    typeof s.category !== "string" ||
    typeof s.purpose !== "string" ||
    typeof s.minimumCondition !== "string" ||
    !s.requirements ||
    Array.isArray(s.requirements) ||
    typeof s.requirements !== "object"
  )
    throw new Error("invalid_source");
  const category = s.category.replace(/\s+/g, " ").trim(),
    purpose = s.purpose.replace(/\s+/g, " ").trim();
  if (
    !category ||
    category.length > 120 ||
    !purpose ||
    purpose.length > 500 ||
    !conditions.has(s.minimumCondition) ||
    !Number.isInteger(s.remainingQty) ||
    s.remainingQty < 1
  )
    throw new Error("invalid_source");
  const fields = [
    `Category: ${category}`,
    `Purpose: ${purpose}`,
    `Minimum condition: ${s.minimumCondition}`,
    `Mandatory requirements: ${JSON.stringify(clean(s.requirements))}`,
  ];
  const text = fields.join("\n");
  if (text.length > 4000) throw new Error("invalid_source");
  return text;
}
const conditions = new Set(["Excellent", "Good", "Fair"]);
const conditionQuality: Record<string, number> = {
  Excellent: 3,
  Good: 2,
  Fair: 1,
};
export function rankCandidates(source: RequestSource, candidates: Candidate[]) {
  return candidates
    .map((x) => {
      if (
        !conditions.has(x.condition) ||
        !conditions.has(source.minimumCondition ?? "") ||
        conditionQuality[x.condition] <
          conditionQuality[source.minimumCondition!] ||
        !Number.isFinite(x.similarity) ||
        !Number.isInteger(x.qty) ||
        x.qty < 1
      )
        throw new Error("invalid_candidate");
      const warnings: string[] = [],
        S = finite01(x.similarity),
        C = 1;
      const Q = Math.min(x.qty / Math.max(1, source.remainingQty), 1);
      const L = 0;
      const compatibility = 100 * (0.65 * S + 0.15 * C + 0.1 * Q + 0.1 * L),
        F = compatibility / 100;
      const T = 0,
        K = 0,
        W = 0,
        E = 0;
      warnings.push(
        "Delivery timing unavailable",
        "Location evidence unavailable",
        "Transfer and repair costs unavailable",
        "Diverted fraction unavailable",
        "Avoided-emissions evidence unavailable",
      );
      const final = 100 * (0.6 * F + 0.15 * T + 0.1 * K + 0.1 * W + 0.05 * E);
      const reason = `${S >= 0.6 ? "Strong" : "Partial"} semantic fit; ${x.condition.toLowerCase()} condition; ${Q >= 1 ? "quantity covers remaining need" : "quantity is partial"}; location, timing, cost, waste, and emissions evidence are unavailable.`;
      return {
        candidate: x,
        semanticCosineScore: Math.max(-1, Math.min(1, x.similarity)),
        s: S,
        c: C,
        q: Q,
        l: L,
        f: F,
        t: T,
        k: K,
        w: W,
        e: E,
        compatibilityScore: compatibility,
        finalRankScore: final,
        reason,
        missingEvidence: warnings,
      };
    })
    .sort(
      (a, b) =>
        b.finalRankScore - a.finalRankScore ||
        b.candidate.similarity - a.candidate.similarity ||
        a.candidate.asset_id.localeCompare(b.candidate.asset_id) ||
        a.candidate.portion_id.localeCompare(b.candidate.portion_id),
    )
    .slice(0, 5)
    .map((r, i) => ({
      ...r,
      rank: i + 1,
      portionId: r.candidate.portion_id,
      assetId: r.candidate.asset_id,
    }));
}
export function createAi2MatchHandler(config: {
  gateway: MatchGateway;
  embed: Embed;
  allowedOrigins: string[];
}) {
  return async (req: Request) => {
    const origin = req.headers.get("origin"),
      allowed = !origin || config.allowedOrigins.includes(origin),
      headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
        Vary: "Origin",
      });
    if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v), { status, headers });
    try {
      if (!allowed)
        return json(
          { error: { code: "forbidden", message: "Origin is not allowed." } },
          403,
        );
      if (req.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      if (req.method !== "POST")
        return json(
          { error: { code: "validation", message: "Use POST." } },
          405,
        );
      const auth = req.headers.get("authorization") || "",
        key = req.headers.get("apikey") || "";
      if (!/^Bearer \S+$/i.test(auth) || !key.startsWith("sb_publishable_"))
        return json(
          {
            error: {
              code: "unauthorized",
              message: "Sign in with a valid session.",
            },
          },
          401,
        );
      const token = auth.replace(/^Bearer\s+/i, "");
      let input: any;
      try {
        const raw = await req.text();
        if (raw.length > 8000) throw 0;
        input = JSON.parse(raw);
      } catch {
        return json(
          { error: { code: "validation", message: "Invalid request body." } },
          400,
        );
      }
      if (
        !input ||
        Object.keys(input).some(
          (k) => !["requestId", "operationKey"].includes(k),
        ) ||
        !uuid.test(input.requestId) ||
        !uuid.test(input.operationKey)
      )
        return json(
          {
            error: {
              code: "validation",
              message: "Provide requestId and operationKey.",
            },
          },
          400,
        );
      let actor: string;
      try {
        actor = await config.gateway.authenticate(token, key);
      } catch {
        return json(
          {
            error: {
              code: "unauthorized",
              message: "Your session is invalid or expired.",
            },
          },
          401,
        );
      }
      let prior: unknown | null;
      try {
        prior = await config.gateway.existing(
          token,
          input.requestId,
          input.operationKey,
        );
      } catch {
        return json(
          {
            outcome: "request_not_eligible",
            requestId: input.requestId,
            recommendations: [],
          },
          409,
        );
      }
      if (prior) return json(prior);
      let source: RequestSource;
      try {
        source = await config.gateway.source(token, input.requestId);
      } catch {
        return json(
          {
            outcome: "request_not_eligible",
            requestId: input.requestId,
            recommendations: [],
          },
          409,
        );
      }
      let text: string;
      try {
        text = serializeRequest(source);
      } catch {
        return json(
          {
            outcome: "request_not_eligible",
            requestId: input.requestId,
            recommendations: [],
          },
          409,
        );
      }
      const started = Date.now();
      let vector: number[];
      try {
        vector = await config.embed(text);
      } catch {
        return json(
          {
            outcome: "embedding_failed",
            requestId: input.requestId,
            recommendations: [],
          },
          503,
        );
      }
      if (
        vector.length !== 384 ||
        vector.some((n) => !Number.isFinite(n)) ||
        Math.abs(Math.hypot(...vector) - 1) > 0.02
      )
        return json(
          {
            outcome: "embedding_failed",
            requestId: input.requestId,
            recommendations: [],
          },
          503,
        );
      const candidates = await config.gateway.candidates(
        token,
        input.requestId,
        vector,
      );
      if (candidates.length > 20)
        return json({ outcome: "internal_error", recommendations: [] }, 503);
      const ranked = rankCandidates(source, candidates);
      const saved = await config.gateway.save(actor, {
        ...input,
        requestVersion: source.version,
        model: "gte-small",
        configurationVersion: "ai2-v1",
        queryVector: vector,
        candidateSnapshot: candidates.map((x) => ({
          portion_id: x.portion_id,
          asset_id: x.asset_id,
          asset_name: x.asset_name,
          description: x.description,
          category_id: x.category_id,
          specifications: x.specifications,
          qty: x.qty,
          condition: x.condition,
          department_id: x.department_id,
          department_name: x.department_name,
          assigned_location: x.assigned_location,
          physical_location: x.physical_location,
          similarity: x.similarity,
        })),
        durationMs: Math.max(0, Date.now() - started),
        providerCallCount: 1,
        outcome: ranked.length ? "completed" : "no_candidates",
        recommendations: ranked,
      });
      const runId = (saved as any)?.runId;
      return json(runId ? await config.gateway.visible(token, runId) : saved);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (
        msg.includes("candidate_set_changed") ||
        msg.includes("stale_request")
      )
        return json(
          { outcome: "candidate_set_changed", recommendations: [] },
          409,
        );
      return json({ outcome: "internal_error", recommendations: [] }, 503);
    }
  };
}
