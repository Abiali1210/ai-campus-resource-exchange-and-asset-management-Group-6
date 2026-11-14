import { canonicalizeAsset, sha256 } from "./canonical.ts";
import {
  boundedBytes,
  GatewayError,
  object,
  stringList,
  uuid,
} from "../foundation/validation.ts";

type Source = {
  assetId: string;
  version: number;
  sourceFingerprint: string;
  name: string;
  category: string;
  description: string | null;
  tags: unknown;
  specifications: unknown;
  contentHash: string | null;
  storedModel: string | null;
  storedContentHash: string | null;
};
export interface EmbeddingGateway {
  authenticate(token: string, key: string): Promise<string>;
  bootstrap(token: string, key: string): Promise<unknown>;
  source(actor: string, asset: string): Promise<Source>;
  upsert(
    actor: string,
    asset: string,
    version: number,
    sourceFingerprint: string,
    hash: string,
    vector: number[],
  ): Promise<unknown>;
}
export type Embedder = (text: string) => Promise<number[]>;
export function createAi2Handler(config: {
  supabaseUrl: string;
  allowedOrigins: string[];
  gateway: EmbeddingGateway;
  embed: Embedder;
}) {
  const url = config.supabaseUrl.replace(/\/$/, "");
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin"),
      allowed = !origin || config.allowedOrigins.includes(origin);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
    if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
    const json = (v: unknown, s = 200) =>
      new Response(JSON.stringify(v), { status: s, headers });
    try {
      if (!allowed)
        throw new GatewayError("Forbidden", "Origin is not allowed.", 403);
      if (req.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      if (req.method !== "POST")
        throw new GatewayError("Validation", "Use POST.", 405);
      if (
        !url.startsWith("https://") &&
        !/^http:\/\/(localhost|127\.0\.0\.1|kong)(:|\/)/.test(url + "/")
      )
        throw new GatewayError(
          "Unavailable",
          "Service configuration is unavailable.",
          503,
        );
      const auth = req.headers.get("authorization") ?? "",
        key = req.headers.get("apikey") ?? "";
      if (!/^Bearer \S+$/i.test(auth) || !key.startsWith("sb_publishable_"))
        throw new GatewayError(
          "Unauthorized",
          "Sign in with a valid session.",
          401,
        );
      const token = auth.replace(/^Bearer\s+/i, "");
      let actor: string;
      try {
        actor = await config.gateway.authenticate(token, key);
      } catch {
        throw new GatewayError(
          "Unauthorized",
          "Your session is invalid or expired.",
          401,
        );
      }
      const b = object(await config.gateway.bootstrap(token, key)),
        p = object(b.profile);
      if (p.userId !== actor || p.active !== true)
        throw new GatewayError(
          "Forbidden",
          "This account is inactive or unavailable.",
          403,
        );
      const roles = stringList(p.roles, "roles", 9);
      if (!roles.includes("representative"))
        throw new GatewayError(
          "Forbidden",
          "Representative permission is required.",
          403,
        );
      const input = object(
        JSON.parse(
          new TextDecoder().decode(
            await boundedBytes(new Response(req.body), 100_000),
          ),
        ),
      );
      let ids: string[];
      if (input.action === "refresh_asset")
        ids = [uuid(input.assetId, "Asset")];
      else if (input.action === "refresh_assets") {
        if (
          !Array.isArray(input.assetIds) ||
          input.assetIds.length < 1 ||
          input.assetIds.length > 10
        )
          throw new GatewayError("Validation", "Provide 1–10 asset IDs.");
        ids = input.assetIds.map((x) => uuid(x, "Asset"));
        if (new Set(ids).size !== ids.length)
          throw new GatewayError("Validation", "Asset IDs must be unique.");
      } else throw new GatewayError("Validation", "Unknown action.");
      const refresh = async (assetId: string) => {
        try {
          const start = Date.now(),
            s = await config.gateway.source(actor, assetId),
            text = canonicalizeAsset(s),
            hash = await sha256(text);
          if (
            s.contentHash === hash &&
            s.storedModel === "gte-small" &&
            s.storedContentHash === hash
          )
            return {
              assetId,
              status: "unchanged",
              model: "gte-small",
              generationDurationMs: 0,
            };
          const vector = await config.embed(text);
          if (
            !Array.isArray(vector) ||
            vector.length !== 384 ||
            vector.some((x) => typeof x !== "number" || !Number.isFinite(x))
          )
            throw new Error("invalid_vector");
          const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
          if (Math.abs(norm - 1) > 0.02) throw new Error("invalid_vector");
          const result = object(
            await config.gateway.upsert(
              actor,
              assetId,
              s.version,
              s.sourceFingerprint,
              hash,
              vector,
            ),
          );
          const status = result.status;
          if (status !== "created" && status !== "updated")
            throw new Error("store_failed");
          return {
            assetId,
            status,
            model: "gte-small",
            generationDurationMs: Math.max(0, Date.now() - start),
          };
        } catch {
          return {
            assetId,
            status: "error",
            error: {
              code: "refresh_failed",
              message: "This asset could not be refreshed.",
            },
          };
        }
      };
      const results = [];
      for (const id of ids) results.push(await refresh(id));
      const failed = results.some((x) => x.status === "error");
      return json(
        input.action === "refresh_asset"
          ? failed
            ? { error: results[0].error }
            : results[0]
          : { results },
        failed ? 409 : 200,
      );
    } catch (e) {
      if (e instanceof GatewayError)
        return json({ error: { code: e.code, message: e.message } }, e.status);
      return json(
        {
          error: {
            code: "Unavailable",
            message: "The service could not complete this request.",
          },
        },
        503,
      );
    }
  };
}
