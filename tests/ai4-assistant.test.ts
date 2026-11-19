import { describe, expect, it, vi } from "vitest";
import {
  DONT_KNOW,
  REFUSAL,
  buildPrompt,
  createAi4AssistantHandler,
  groundReply,
  isWorkflowCommand,
  toContextItems,
} from "../supabase/functions/ai4-assistant/handler.ts";
import { askAssistant, assistantErrorMessage } from "../src/ai4";

// Synthetic, caller-scoped rows as search_assets / workflow_workspace return them.
const MONITOR = "00000000-0000-4000-8000-0000000000a1";
const PROJECTOR = "00000000-0000-4000-8000-0000000000a2";
const REQUEST = "00000000-0000-4000-8000-0000000000b1";
const catalogueRows = [
  {
    portionId: MONITOR,
    assetId: "asset-1",
    name: "Dell 24-inch monitor",
    description: "Small scratch on bezel",
    categoryName: "Monitor",
    condition: "Good",
    departmentName: "Engineering",
    assignedLocation: "Building B, Room 12",
    qty: 3,
    unitValue: 900, // financial field: must never reach the model
  },
  {
    portionId: PROJECTOR,
    assetId: "asset-2",
    name: "Epson projector",
    description: "",
    categoryName: "Projector",
    condition: "Fair",
    departmentName: "Engineering",
    assignedLocation: "Store 2",
    qty: 2,
    unitValue: 1800,
  },
];
const requestRows = [
  {
    requestId: REQUEST,
    purpose: "Monitors for the design lab",
    status: "Partially Fulfilled",
    urgency: "High",
    requestedQty: 6,
    remainingQty: 2,
    requiredDate: "2026-12-15",
  },
];
const categories = [
  { categoryId: "cat-chair", name: "Chair" },
  { categoryId: "cat-monitor", name: "Monitor" },
];
const ctx = {
  items: toContextItems(catalogueRows),
  requests: requestRows as any,
  categories,
};

const geminiReply = (body: unknown) => ({
  candidates: [
    {
      finishReason: "STOP",
      content: { parts: [{ text: JSON.stringify(body) }] },
    },
  ],
});

function setup(provider: any = vi.fn()) {
  const gateway = {
    authenticate: vi.fn(async () => "user"),
    catalogue: vi.fn(async () => catalogueRows),
    requests: vi.fn(async () => requestRows),
    categories: vi.fn(async () => categories),
  };
  const handler = createAi4AssistantHandler({
    gateway,
    provider,
    allowedOrigins: [],
    providerTimeoutMs: 50,
    now: () => new Date("2026-11-19T10:00:00Z"),
  });
  const request = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://edge", {
      method: "POST",
      headers: {
        authorization: "Bearer session",
        apikey: "sb_publishable_test",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { handler, gateway, provider, request };
}

describe("AI #4 grounding", () => {
  it("accepts an answer that only references supplied records and their numbers", () => {
    const reply = groundReply(
      {
        intent: "find_items",
        answer: "Engineering has 2 projectors available in Store 2.",
        itemIds: [PROJECTOR],
        requestIds: [],
      },
      ctx,
      "Any projectors in Engineering?",
    );
    expect(reply?.intent).toBe("find_items");
    expect(reply?.items.map((i) => i.portionId)).toEqual([PROJECTOR]);
  });

  it("allows digits from a quoted name or location but not as free numbers", () => {
    const base = { intent: "find_items", itemIds: [MONITOR], requestIds: [] };
    expect(
      groundReply(
        {
          ...base,
          answer: "3 Dell 24-inch monitor units are in Building B, Room 12.",
        },
        ctx,
        "monitors?",
      ),
    ).not.toBeNull();
    expect(
      groundReply({ ...base, answer: "There are 24 monitors." }, ctx, "x"),
    ).toBeNull();
  });

  it("rejects references to records the caller was not given", () => {
    expect(
      groundReply(
        {
          intent: "find_items",
          answer: "Here is a projector.",
          itemIds: ["00000000-0000-4000-8000-00000000dead"],
          requestIds: [],
        },
        ctx,
        "projector?",
      ),
    ).toBeNull();
  });

  it("rejects invented numbers and identifiers in the answer text", () => {
    const base = { intent: "find_items", itemIds: [MONITOR], requestIds: [] };
    expect(
      groundReply(
        { ...base, answer: "There are 40 monitors." },
        ctx,
        "monitors?",
      ),
    ).toBeNull();
    expect(
      groundReply({ ...base, answer: `Monitor ${MONITOR} is free.` }, ctx, "x"),
    ).toBeNull();
  });

  it("turns 'unknown' and empty item searches into I don't know", () => {
    expect(
      groundReply(
        { intent: "unknown", answer: "No idea.", itemIds: [], requestIds: [] },
        ctx,
        "Who is the dean?",
      )?.answer,
    ).toBe(DONT_KNOW);
    expect(
      groundReply(
        {
          intent: "find_items",
          answer: "No tents are listed.",
          itemIds: [],
          requestIds: [],
        },
        ctx,
        "tents?",
      )?.answer,
    ).toBe(DONT_KNOW);
  });

  it("maps a draft to a known category and clamps unsafe values", () => {
    const reply = groundReply(
      {
        intent: "draft_request",
        answer:
          "I prepared a request for 4 chairs. Review it before submitting.",
        itemIds: [],
        requestIds: [],
        draft: {
          purpose: "Chairs for lab",
          categoryName: "chair",
          quantity: 4,
          urgency: "Urgent!!",
        },
      },
      ctx,
      "I need 4 chairs for a lab",
    );
    expect(reply?.draft).toEqual({
      purpose: "Chairs for lab",
      categoryId: "cat-chair",
      categoryName: "Chair",
      qty: 4,
      urgency: "Normal",
    });
  });

  it("detects imperative workflow commands", () => {
    expect(isWorkflowCommand("Approve my request")).toBe(true);
    expect(isWorkflowCommand("please transfer the monitor to me")).toBe(true);
    expect(isWorkflowCommand("What's the status of my transfer?")).toBe(false);
  });

  it("never sends financial fields or asset ids to the model", () => {
    const text = JSON.stringify(buildPrompt("monitors?", ctx, "2026-11-19"));
    expect(text).not.toContain("unitValue");
    expect(text).not.toContain("1800");
    expect(text).not.toContain("asset-1");
  });
});

describe("AI #4 handler", () => {
  it("answers from caller-scoped records", async () => {
    const provider = vi.fn(async () =>
      geminiReply({
        intent: "request_status",
        answer:
          "Your design lab request is partially fulfilled; 2 of 6 monitors are still needed.",
        itemIds: [],
        requestIds: [REQUEST],
      }),
    );
    const { handler, request, gateway } = setup(provider);
    const res = await handler(request({ question: "status of my requests?" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.grounded).toBe(true);
    expect(body.requests[0].requestId).toBe(REQUEST);
    // The gateway is called with the caller's own session token.
    expect(gateway.catalogue).toHaveBeenCalledWith("session");
  });

  it("refuses workflow commands without calling the model", async () => {
    const { handler, request, provider } = setup();
    const body = await (
      await handler(request({ question: "Approve the monitor reservation" }))
    ).json();
    expect(body.intent).toBe("workflow_action");
    expect(body.answer).toBe(REFUSAL);
    expect(provider).not.toHaveBeenCalled();
  });

  it("falls back to I don't know when the model output is ungrounded", async () => {
    const provider = vi.fn(async () =>
      geminiReply({
        intent: "find_items",
        answer: "There are 12 laptops.",
        itemIds: [MONITOR],
        requestIds: [],
      }),
    );
    const { handler, request } = setup(provider);
    const body = await (
      await handler(request({ question: "laptops?" }))
    ).json();
    expect(body).toMatchObject({
      answer: DONT_KNOW,
      grounded: false,
      items: [],
    });
  });

  it("reports provider timeouts and quota without inventing an answer", async () => {
    const slow = setup(vi.fn(() => new Promise(() => {})));
    expect(
      await (
        await slow.handler(slow.request({ question: "monitors?" }))
      ).json(),
    ).toEqual({ error: { code: "timeout" } });
    const quota = setup(
      vi.fn(async () => {
        throw Error("provider_429");
      }),
    );
    expect(
      await (
        await quota.handler(quota.request({ question: "monitors?" }))
      ).json(),
    ).toEqual({ error: { code: "quota" } });
  });

  it("rejects unauthenticated and malformed input", async () => {
    const { handler, request, gateway } = setup();
    expect(
      (await handler(request({ question: "hi" }, { apikey: "service_role" })))
        .status,
    ).toBe(401);
    expect((await handler(request({ question: "" }))).status).toBe(400);
    expect(
      (await handler(request({ question: "hi", extra: true }))).status,
    ).toBe(400);
    gateway.authenticate.mockRejectedValueOnce(Error("bad"));
    expect((await handler(request({ question: "hi" }))).status).toBe(401);
  });
});

describe("AI #4 client", () => {
  it("returns a valid reply and maps failures to fallback guidance", async () => {
    const reply = {
      intent: "unknown",
      answer: DONT_KNOW,
      grounded: true,
      items: [],
      requests: [],
      draft: null,
      model: "m",
    };
    await expect(
      askAssistant(async () => ({ data: reply, error: null }), "hi"),
    ).resolves.toEqual(reply);
    await expect(
      askAssistant(
        async () => ({ data: { error: { code: "timeout" } }, error: null }),
        "hi",
      ),
    ).rejects.toThrow(assistantErrorMessage("timeout"));
    await expect(
      askAssistant(async () => {
        throw Error("offline");
      }, "hi"),
    ).rejects.toThrow(/Requests and transfers page/);
    await expect(
      askAssistant(async () => ({ data: reply, error: null }), " "),
    ).rejects.toThrow(/500 characters/);
  });
});
