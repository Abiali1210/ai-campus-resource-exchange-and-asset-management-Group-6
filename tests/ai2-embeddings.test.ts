import { describe, it, expect, vi } from "vitest";
import {
  canonicalizeAsset,
  sha256,
} from "../supabase/functions/ai2-embeddings/canonical";
import {
  createAi2Handler,
  type EmbeddingGateway,
} from "../supabase/functions/ai2-embeddings/handler";
const actor = "00000000-0000-4000-8000-000000000001",
  asset = "00000000-0000-4000-8000-000000000002";
const src = {
  assetId: asset,
  version: 1,
  sourceFingerprint: "source-fingerprint-test",
  name: " Lamp ",
  category: "Lighting",
  description: " desk  lamp ",
  tags: ["wood", "metal", "wood"],
  specifications: { z: 1, a: { y: true, x: 2 } },
  contentHash: null,
  storedModel: null,
  storedContentHash: null,
};
function setup(
  overrides: Partial<EmbeddingGateway> = {},
  embed = vi.fn(async () => Array(384).fill(1 / Math.sqrt(384))),
) {
  const gateway: EmbeddingGateway = {
    authenticate: vi.fn(async () => actor),
    bootstrap: vi.fn(async () => ({
      profile: { userId: actor, active: true, roles: ["representative"] },
    })),
    source: vi.fn(async () => src),
    upsert: vi.fn(async () => ({ status: "created" })),
    ...overrides,
  };
  const handler = createAi2Handler({
    supabaseUrl: "https://test.supabase.co",
    allowedOrigins: ["https://app.test"],
    gateway,
    embed,
  });
  return { handler, gateway, embed };
}
function req(
  action = "refresh_asset",
  body: Record<string, unknown> = { assetId: asset },
  headers: Record<string, string> = {},
) {
  return new Request("https://edge.test", {
    method: "POST",
    headers: {
      authorization: "Bearer token",
      apikey: "sb_publishable_test",
      origin: "https://app.test",
      ...headers,
    },
    body: JSON.stringify({ action, ...body }),
  });
}
describe("AI2 asset embeddings", () => {
  it("canonicalizes order, whitespace, tags and ignores unrelated fields", async () => {
    const a = canonicalizeAsset(src),
      b = canonicalizeAsset({
        ...src,
        name: "Lamp",
        tags: ["metal", "wood"],
        specifications: { a: { x: 2, y: true }, z: 1 },
        secret: "excluded",
      } as never);
    expect(a).toBe(b);
    expect(a).toBe(
      'Asset name: Lamp\nCategory: Lighting\nDescription: desk lamp\nTags: metal, wood\nSpecifications: {"a":{"x":2,"y":true},"z":1}',
    );
    expect(await sha256(a)).toBe(await sha256(b));
    expect(await sha256(a)).toBe(
      "4afcba0065f54792dac532efce8b50bb5b1ba43539c70360e1ef537700b312f1",
    );
  });
  it("rejects semantic limits, oversized Unicode, excess tags and invalid specification values", () => {
    const emoji = "😀";
    for (const value of ["x".repeat(201), emoji.repeat(201)])
      expect(() => canonicalizeAsset({ ...src, name: value })).toThrow();
    expect(() =>
      canonicalizeAsset({ ...src, description: emoji.repeat(4001) }),
    ).toThrow();
    expect(() =>
      canonicalizeAsset({
        ...src,
        tags: Array.from({ length: 51 }, (_, i) => `tag ${i}`),
      }),
    ).toThrow();
    expect(() =>
      canonicalizeAsset({ ...src, tags: [emoji.repeat(101)] }),
    ).toThrow();
    expect(() =>
      canonicalizeAsset({ ...src, specifications: { long: "x".repeat(6000) } }),
    ).toThrow();
    expect(() =>
      canonicalizeAsset({ ...src, specifications: { bad: Number.NaN } }),
    ).toThrow();
    expect(() =>
      canonicalizeAsset({ ...src, specifications: { bad: Infinity } }),
    ).toThrow();
    expect(() =>
      canonicalizeAsset({ ...src, specifications: { bad: undefined } }),
    ).toThrow();
  });
  it("rejects missing/invalid bearer and non-representative users", async () => {
    for (const headers of [
      { authorization: "" },
      { authorization: "Basic x" },
      { apikey: "secret" },
    ])
      expect(
        (
          await setup().handler(
            req("refresh_asset", { assetId: asset }, headers),
          )
        ).status,
      ).toBe(401);
    expect(
      (
        await setup({
          authenticate: vi.fn(async () => {
            throw Error("JWT secret diagnostic");
          }),
        }).handler(req())
      ).status,
    ).toBe(401);
    const s = setup({
      bootstrap: vi.fn(async () => ({
        profile: {
          userId: actor,
          active: true,
          roles: ["business_administrator"],
        },
      })),
    });
    expect((await s.handler(req())).status).toBe(403);
  });
  it("checks profile and department failures safely", async () => {
    const s = setup({
      bootstrap: vi.fn(async () => ({
        profile: { userId: asset, active: false, roles: ["representative"] },
      })),
    });
    expect((await s.handler(req())).status).toBe(403);
    const d = setup({
      source: vi.fn(async () => {
        throw Error("department secret diagnostic");
      }),
    });
    const r = await d.handler(req());
    expect(r.status).toBe(409);
    expect(await r.text()).not.toContain("diagnostic");
  });
  it("refreshes, avoids vector response, and does not store inference failures", async () => {
    const s = setup();
    const r = await s.handler(req());
    const body = await r.text();
    expect(JSON.parse(body).status).toBe("created");
    expect(body).not.toContain("0.05");
    expect(s.gateway.upsert).toHaveBeenCalledOnce();
    const bad = setup(
      {},
      vi.fn(async () => [NaN]),
    );
    expect((await bad.handler(req())).status).toBe(409);
    expect(bad.gateway.upsert).not.toHaveBeenCalled();
  });
  it("refreshes changed content and passes exact atomic upsert arguments without returning the vector", async () => {
    const vector = Array(384).fill(1 / Math.sqrt(384));
    const upsert = vi.fn(async () => ({ status: "updated" }));
    const s = setup(
      {
        source: vi.fn(async () => ({
          ...src,
          version: 7,
          contentHash: "old",
          storedContentHash: "old",
          storedModel: "gte-small",
        })),
        upsert,
      },
      vi.fn(async () => vector),
    );
    const response = await s.handler(req());
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text).status).toBe("updated");
    expect(text).not.toContain(String(vector[0]));
    expect(upsert).toHaveBeenCalledWith(
      actor,
      asset,
      7,
      "source-fingerprint-test",
      await sha256(canonicalizeAsset(src)),
      vector,
    );
  });
  it("keeps processing after a failed batch item and returns safe mixed 409 results", async () => {
    const second = "00000000-0000-4000-8000-000000000003";
    const source = vi.fn(async (_actor: string, id: string) => {
      if (id === asset) throw Error("secret raw diagnostic");
      return { ...src, assetId: id };
    });
    const s = setup({ source });
    const response = await s.handler(
      req("refresh_assets", { assetIds: [asset, second] }),
    );
    const body = await response.text();
    expect(response.status).toBe(409);
    expect(source).toHaveBeenCalledTimes(2);
    expect(body).toContain('"status":"created"');
    expect(body).toContain('"status":"error"');
    expect(body).not.toMatch(/diagnostic|secret|0\.051|embedding/i);
  });
  it("requires bounded unique batches and processes in sequence", async () => {
    const s = setup();
    expect(
      (
        await s.handler(
          req("refresh_assets", { assetIds: Array(11).fill(asset) }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await s.handler(req("refresh_assets", { assetIds: [asset, asset] })))
        .status,
    ).toBe(400);
  });
  it("cache hit skips inference; validates vectors", async () => {
    const text = canonicalizeAsset(src),
      hash = await sha256(text),
      embed = vi.fn(async () => Array(384).fill(1 / Math.sqrt(384)));
    const s = setup(
      {
        source: vi.fn(async () => ({
          ...src,
          contentHash: hash,
          storedModel: "gte-small",
          storedContentHash: hash,
        })),
      },
      embed,
    );
    expect((await (await s.handler(req())).json()).status).toBe("unchanged");
    expect(embed).not.toHaveBeenCalled();
    for (const vector of [
      Array(383).fill(0),
      Array(384).fill(NaN),
      Array(384).fill(Infinity),
      Array(384).fill(2),
    ]) {
      const bad = setup(
        {},
        vi.fn(async () => vector),
      );
      expect((await bad.handler(req())).status).toBe(409);
      expect(bad.gateway.upsert).not.toHaveBeenCalled();
    }
  });
});
