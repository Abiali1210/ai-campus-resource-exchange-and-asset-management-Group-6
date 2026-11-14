import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  createAi5GenerateHandler,
  validateSummary,
} from "../supabase/functions/ai5-generate/handler.ts";

const facts = {
  requests_submitted: 20,
  open_requests: 8,
  completed_transfers: 7,
  units_successfully_transferred: 5,
};
const snapshot = {
  snapshot_id: "00000000-0000-4000-8000-000000000001",
  facts,
  period_start: "2026-10-01",
  period_end: "2026-12-31",
  captured_at: "2026-12-31",
  schema_version: 1,
  calculation_version: "ai5-all-time-v1",
};
const id = "00000000-0000-4000-8000-000000000002";
function setup(
  provider: any = vi.fn(async () => ({
    responseId: "response-123",
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [
            {
              text: JSON.stringify({
                summary: "The snapshot records 20 requests, with 8 open.",
              }),
            },
          ],
        },
      },
    ],
  })),
) {
  const gateway = {
    authenticate: vi.fn(async () => "user"),
    replay: vi.fn(async () => null),
    context: vi.fn(async () => snapshot),
    save: vi.fn(async (...args: any[]) => ({ saved: true, args })),
  };
  const handler = createAi5GenerateHandler({
    gateway,
    provider,
    allowedOrigins: [],
  });
  const request = (
    body: unknown = { snapshotId: snapshot.snapshot_id, idempotencyKey: id },
  ) =>
    new Request("http://edge", {
      method: "POST",
      headers: {
        authorization: "Bearer session",
        apikey: "sb_publishable_test",
      },
      body: JSON.stringify(body),
    });
  return { handler, gateway, provider, request };
}
describe("AI5 generation", () => {
  it("keeps the production Gemini generateContent REST contract aligned", () => {
    const source = readFileSync(
      new URL("../supabase/functions/ai5-generate/index.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      '"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"',
    );
    expect(source).toContain('"x-goog-api-key": apiKey');
    expect(source).not.toContain("Api-Revision");
    expect(source).not.toContain("/v1beta/interactions");
  });
  it("validates exact shape, permits repeated fact values and rejects unsupported numeric forms", () => {
    expect(
      validateSummary({ summary: "8 and 8 items were reused." }, facts),
    ).toBe(true);
    expect(validateSummary({ summary: "9 items." }, facts)).toBe(false);
    for (const summary of [
      "20%",
      "20 percent",
      "2.5",
      "2,5",
      "2026/11/14",
      "2026-11-14",
      "$20",
      "20 dollars",
      "8-20",
      "8 to 20",
      "8 + 7",
      "eight items",
      "first result",
      "8 impact",
      "8 savings",
      "8 emissions",
      "8 waste",
      "8 utilization",
      "8 maintenance",
      "8 estimate",
      "8 / 2",
      "8 kg",
      "8th result",
    ])
      expect(validateSummary({ summary }, facts)).toBe(false);
    expect(
      validateSummary({ summary: "Activity may remain open." }, facts),
    ).toBe(true);
    for (const value of [
      { summary: "" },
      { summary: "x".repeat(601) },
      { summary: "x", extra: true },
      {},
    ])
      expect(validateSummary(value, facts)).toBe(false);
  });
  it("sends bounded exact contract and saves with caller idempotency key", async () => {
    const x = setup();
    const response = await x.handler(x.request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.snapshot).toEqual(snapshot);
    expect(x.provider).toHaveBeenCalledTimes(1);
    const payload = x.provider.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(["contents", "generationConfig"]);
    expect(payload.contents[0].role).toBe("user");
    expect(payload.contents[0].parts[0].text).toContain(JSON.stringify(facts));
    expect(payload.generationConfig).toEqual({
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: { summary: { type: "string", maxLength: 600 } },
        required: ["summary"],
        additionalProperties: false,
      },
    });
    for (const key of [
      "period_start",
      "period_end",
      "captured_at",
      "schema_version",
      "calculation_version",
    ])
      expect(payload.contents[0].parts[0].text).toContain(`"${key}":`);
    for (const key of [
      "snapshot_id",
      "created_by",
      "idempotency_key",
      "request_metadata",
      "status",
      "actor_id",
      "user_id",
      "snapshotId",
      "idempotencyKey",
    ])
      expect(payload.contents[0].parts[0].text).not.toContain(key);
    expect(x.gateway.save).toHaveBeenCalledWith(
      "session",
      snapshot.snapshot_id,
      id,
      "gemini-3.5-flash-lite",
      "The snapshot records 20 requests, with 8 open.",
      expect.any(Object),
    );
    expect(x.gateway.save.mock.calls[0][5]).toMatchObject({
      provider: "google-generate-content",
      contract: "generate-content-v1beta",
      response_format: "application/json",
      provider_response_id: "response-123",
    });
  });
  it("persists provider response IDs only up to 256 characters", async () => {
    for (const length of [256, 257]) {
      const x = setup(
        vi.fn(async () => ({
          responseId: "x".repeat(length),
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      summary: "The snapshot records 20 requests, with 8 open.",
                    }),
                  },
                ],
              },
            },
          ],
        })),
      );
      await x.handler(x.request());
      const metadata = x.gateway.save.mock.calls[0][5];
      expect(metadata.provider_response_id).toBe(
        length === 256 ? "x".repeat(256) : undefined,
      );
    }
  });
  it("returns snapshot on provider and malformed failures without retries", async () => {
    const result = (value: unknown) => ({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: typeof value === "string" ? value : JSON.stringify(value),
              },
            ],
          },
        },
      ],
    });
    for (const provider of [
      ...["in_progress", "failed", "incomplete"].map((status) =>
        vi.fn(async () => ({
          candidates: [
            {
              finishReason: status,
              content: { parts: [{ text: '{"summary":"x"}' }] },
            },
          ],
        })),
      ),
      vi.fn(async () => ({ candidates: [] })),
      vi.fn(async () => ({
        candidates: [{ finishReason: "STOP" }, { finishReason: "STOP" }],
      })),
      vi.fn(async () => ({
        candidates: [{ finishReason: "STOP", content: { parts: [] } }],
      })),
      vi.fn(async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [{ text: '{"summary":"x"}' }, { text: '{"summary":"x"}' }],
            },
          },
        ],
      })),
      vi.fn(async () => {
        throw Error("429 quota");
      }),
      vi.fn(async () => result("{")),
      vi.fn(async () => ({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "" }] } },
        ],
      })),
      ...[
        "9 items.",
        "8 impact",
        "8 saved",
        "8 CO2 emissions",
        "8 waste",
        "8 utilization",
        "8 maintenance",
        "8 estimate",
        "8.5",
        "8,5",
        "8/7/26",
        "8-20",
        "8 to 20",
        "8 + 7",
        "eight",
        "first",
      ].map((summary) => vi.fn(async () => result({ summary }))),
      ...[
        {},
        { summary: "" },
        { summary: "x".repeat(601) },
        { summary: "x", extra: true },
      ].map((value) => vi.fn(async () => result(value))),
    ]) {
      const x = setup(provider),
        r = await x.handler(x.request()),
        body = await r.json();
      expect(body.snapshot).toEqual(snapshot);
      expect(r.status).toBe(200);
      expect(body.error.code).toBeDefined();
      expect(provider).toHaveBeenCalledTimes(1);
      expect(x.gateway.save).not.toHaveBeenCalled();
    }
  });
  it("rejects malformed request schemas before provider calls and handles context failure", async () => {
    for (const body of [
      "not-json",
      {},
      { snapshotId: snapshot.snapshot_id },
      { snapshotId: snapshot.snapshot_id, idempotencyKey: id, extra: true },
      { snapshotId: "", idempotencyKey: id },
      { snapshotId: snapshot.snapshot_id, idempotencyKey: "x".repeat(5000) },
    ]) {
      const x = setup();
      const req =
        body === "not-json"
          ? new Request("http://edge", {
              method: "POST",
              headers: {
                authorization: "Bearer session",
                apikey: "sb_publishable_test",
              },
              body,
            })
          : x.request(body);
      expect((await x.handler(req)).status).toBe(400);
      expect(x.provider).not.toHaveBeenCalled();
    }
    const x = setup();
    x.gateway.context.mockRejectedValue(Error("context"));
    const response = await x.handler(x.request());
    expect(response.status).toBe(400);
    expect((await response.json()).snapshot).toBeNull();
    expect(x.provider).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated requests and preserves snapshot for timeout", async () => {
    const x = setup(vi.fn(() => new Promise(() => {})));
    const denied = await x.handler(
      new Request("http://edge", { method: "POST", body: "{}" }),
    );
    expect(denied.status).toBe(401);
    expect(x.gateway.replay).not.toHaveBeenCalled();
    expect(x.gateway.context).not.toHaveBeenCalled();
    expect(x.provider).not.toHaveBeenCalled();
    const timeout = createAi5GenerateHandler({
      gateway: x.gateway,
      provider: x.provider,
      allowedOrigins: [],
      providerTimeoutMs: 1,
    });
    const body = await (await timeout(x.request())).json();
    expect(body.error.code).toBe("timeout");
    expect(body.snapshot).toEqual(snapshot);
  });
  it("replays sequential identical requests before context/provider/save", async () => {
    const x = setup();
    let saved: any;
    x.gateway.save.mockImplementation(async (...args: any[]) => {
      saved = {
        snapshot,
        report: { narrative_id: id, generated_text: args[4] },
      };
      return saved.report;
    });
    x.gateway.replay.mockImplementation(async () => saved ?? null);
    const first = await (await x.handler(x.request())).json();
    const second = await (await x.handler(x.request())).json();
    expect(first.snapshot).toEqual(snapshot);
    expect(second).toEqual({ ...saved, replay: true });
    expect(x.gateway.replay).toHaveBeenCalledTimes(2);
    expect(x.gateway.context).toHaveBeenCalledTimes(1);
    expect(x.provider).toHaveBeenCalledTimes(1);
    expect(x.gateway.save).toHaveBeenCalledTimes(1);
  });
  it("surfaces same-key different-snapshot replay conflicts without generation", async () => {
    const x = setup();
    x.gateway.replay.mockRejectedValue(Error("conflict"));
    const body = await (await x.handler(x.request())).json();
    expect(body.snapshot).toBeNull();
    expect(x.gateway.context).not.toHaveBeenCalled();
    expect(x.provider).not.toHaveBeenCalled();
    expect(x.gateway.save).not.toHaveBeenCalled();
  });
  it("does not consult replay after authentication failure", async () => {
    const x = setup();
    x.gateway.authenticate.mockRejectedValue(Error("auth"));
    expect((await x.handler(x.request())).status).toBe(401);
    expect(x.gateway.replay).not.toHaveBeenCalled();
    expect(x.gateway.context).not.toHaveBeenCalled();
    expect(x.provider).not.toHaveBeenCalled();
  });
});
