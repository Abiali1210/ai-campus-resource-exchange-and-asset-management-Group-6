import { describe, expect, it, vi } from "vitest";
import {
  DONT_KNOW,
  REFUSAL,
  buildPrompt,
  createAi4AssistantHandler,
  groundReply,
  isTransientProviderError,
  isWorkflowCommand,
  searchItems,
  stemWord,
  toContextItems,
  toSearchEntries,
} from "../supabase/functions/ai4-assistant/handler.ts";
import {
  askAssistant,
  assistantErrorMessage,
  isRetryableAssistantError,
} from "../src/ai4";

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

function setup(provider: any = vi.fn(), rows: any[] = catalogueRows) {
  const gateway = {
    authenticate: vi.fn(async () => "user"),
    catalogue: vi.fn(async () => rows),
    requests: vi.fn(async () => requestRows),
    categories: vi.fn(async () => categories),
  };
  const log = vi.fn();
  const handler = createAi4AssistantHandler({
    gateway,
    provider,
    allowedOrigins: [],
    providerTimeoutMs: 50,
    retryBackoffMs: 1,
    log,
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
  return { handler, gateway, provider, request, log };
}

// A larger synthetic catalogue for the live-testing examples of 22 November.
const row = (
  id: number,
  name: string,
  departmentName: string,
  extra: Record<string, unknown> = {},
) => ({
  portionId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  assetId: `asset-${id}`,
  name,
  description: "",
  categoryName: "",
  condition: "Good",
  departmentName,
  assignedLocation: `${departmentName} store`,
  qty: 1,
  ...extra,
});
const liveCatalogue = [
  row(1, "Epson projector", "Engineering", { categoryName: "Projector" }),
  row(2, "BenQ classroom projector", "Engineering"),
  row(3, "Portable projector", "Engineering", { qty: 2 }),
  row(4, "Ceiling projector kit", "Engineering"),
  row(5, "Epson projector", "Science", { categoryName: "Projector" }),
  row(6, "Stacking chairs", "Science", { qty: 10 }),
  row(7, "Lab chair", "Science"),
  row(8, "Armchair", "Science"),
  row(9, "Ergonomic seat", "Science", { categoryName: "Chair" }),
  row(10, "Office seating", "Science", { tags: ["chair", "office"] }),
  row(11, "Lab chair", "Engineering"),
  row(12, "Dell monitor", "Engineering", { categoryName: "Monitor" }),
  row(13, "Lab stool", "Science", { description: "Not a seat with a back" }),
];
const idsOf = (items: { portionId: string }[]) => items.map((i) => i.portionId);

describe("AI #4 grounding", () => {
  it("does not repeat a model status that contradicts a submitted request", () => {
    const submitted = {
      ...requestRows[0],
      status: "Submitted",
      remainingQty: 6,
    };
    const reply = groundReply(
      {
        intent: "request_status",
        answer: "Your request is fully fulfilled and approved.",
        itemIds: [],
        requestIds: [REQUEST],
      },
      { ...ctx, requests: [submitted] },
      "What is my request status?",
    );
    expect(reply?.answer).not.toMatch(/approved|fully fulfilled/i);
    expect(reply?.requests).toEqual([submitted]);
    expect(reply?.answer).toMatch(/status|statuses/i);
  });

  it("does not call an omitted request selection an empty account", () => {
    expect(
      groundReply(
        {
          intent: "request_status",
          answer: "You have 0 requests.",
          itemIds: [],
          requestIds: [],
        },
        ctx,
        "What is my request status?",
      ),
    ).toBeNull();
  });

  it("keeps multiple request statuses and quantities attached to their own records", () => {
    const rows = [
      requestRows[0],
      {
        ...requestRows[0],
        requestId: "other-request",
        status: "Fulfilled",
        remainingQty: 0,
      },
    ];
    const reply = groundReply(
      {
        intent: "request_status",
        answer: "Both requests are fulfilled.",
        itemIds: [],
        requestIds: rows.map((r) => r.requestId),
      },
      { ...ctx, requests: rows },
      "What is the status of my requests?",
    );
    expect(reply?.answer).not.toContain("Both requests are fulfilled");
    expect(reply?.requests).toEqual(rows);
    expect(reply?.items).toEqual([]);
  });

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
  it("reports a failed request lookup without asking the model to infer absence", async () => {
    const { handler, request, gateway, provider } = setup(
      vi.fn(async () =>
        geminiReply({
          intent: "request_status",
          answer: "You have 0 requests.",
          itemIds: [],
          requestIds: [],
        }),
      ),
    );
    gateway.requests.mockRejectedValueOnce(Error("database unavailable"));
    const body = await (
      await handler(request({ question: "What is my request status?" }))
    ).json();
    expect(body).toEqual({ error: { code: "context" } });
    expect(provider).not.toHaveBeenCalled();
  });

  it("reports malformed request context as unavailable rather than empty", async () => {
    const { handler, request, gateway, provider } = setup();
    gateway.requests.mockResolvedValueOnce(null as any);
    expect(
      await (
        await handler(request({ question: "What is my request status?" }))
      ).json(),
    ).toEqual({ error: { code: "context" } });
    expect(provider).not.toHaveBeenCalled();
  });

  it("reports a genuinely empty permitted request list without inventing a status", async () => {
    const { handler, request, gateway } = setup(
      vi.fn(async () =>
        geminiReply({
          intent: "request_status",
          answer: "Your request is approved.",
          itemIds: [],
          requestIds: [],
        }),
      ),
    );
    gateway.requests.mockResolvedValueOnce([]);
    const body = await (
      await handler(request({ question: "What is my request status?" }))
    ).json();
    expect(body).toMatchObject({
      intent: "request_status",
      answer: "No requests are visible to your account.",
      grounded: true,
      requests: [],
    });
  });

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

describe("AI #4 deterministic item search (issue 2)", () => {
  const projectorPick = (itemIds: string[], answer: string) =>
    vi.fn(async () =>
      geminiReply({
        intent: "find_items",
        answer,
        itemIds,
        requestIds: [],
        search: { keywords: ["projector"], departmentName: "Engineering" },
      }),
    );
  const ask = async (provider: any, question: string) => {
    const { handler, request } = setup(provider, liveCatalogue);
    return (await handler(request({ question }))).json();
  };
  const engineeringProjectors = idsOf(liveCatalogue.slice(0, 4)).sort();

  it("lists every Engineering projector, whatever the model picked", async () => {
    // Live testing: the same question listed 1 item once and 4 another time,
    // and one reply said "a projector" while listing 4.
    const once = await ask(
      projectorPick([liveCatalogue[0].portionId], "There is a projector."),
      "Any projectors in Engineering?",
    );
    const again = await ask(
      projectorPick(engineeringProjectors, "Yes, a projector is available."),
      "Any projectors in Engineering?",
    );
    for (const body of [once, again]) {
      expect(body.grounded).toBe(true);
      expect(idsOf(body.items).sort()).toEqual(engineeringProjectors);
      expect(body.answer).toBe(
        'I found 4 available catalogue items matching "projector" in Engineering. See each record below.',
      );
    }
    expect(once.items).toEqual(again.items);
  });

  it("lists all five Science chairs, including category and tag matches", async () => {
    // Live testing: "Any chairs in Science?" listed 3 of 5 chair items.
    const body = await ask(
      vi.fn(async () =>
        geminiReply({
          intent: "find_items",
          answer: "Science has 3 chairs.",
          itemIds: idsOf(liveCatalogue.slice(5, 8)),
          requestIds: [],
          search: { keywords: ["chairs"], departmentName: "Science" },
        }),
      ),
      "Any chairs in Science?",
    );
    expect(body.items.map((i: any) => i.name).sort()).toEqual([
      "Armchair",
      "Ergonomic seat",
      "Lab chair",
      "Office seating",
      "Stacking chairs",
    ]);
    expect(body.items.every((i: any) => i.departmentName === "Science")).toBe(
      true,
    );
    expect(body.answer).toMatch(/^I found 5 available catalogue items/);
  });

  it("only applies a department the question itself names", () => {
    const entries = toSearchEntries(liveCatalogue);
    const search = { keywords: ["projector"], departmentName: "Engineering" };
    expect(
      searchItems(entries, search, "Any projectors?").matches,
    ).toHaveLength(5);
    const arts = searchItems(
      entries,
      { keywords: ["projector"], departmentName: "Arts" },
      "Any projectors in Arts?",
    );
    expect(arts.matches).toEqual([]);
    expect(
      groundReply(
        {
          intent: "find_items",
          answer: "x",
          itemIds: [],
          requestIds: [],
          search: { keywords: ["projector"], departmentName: "Arts" },
        },
        { ...ctx, catalogue: entries },
        "Any projectors in Arts?",
      )?.answer,
    ).toBe(
      `I couldn't find any available catalogue items matching "projector" in Arts. Try the catalogue search with other words.`,
    );
  });

  it("searches the whole catalogue, not only the sample sent to the model", () => {
    const many = Array.from({ length: 70 }, (_, i) =>
      row(100 + i, `Filler item ${i}`, "Science"),
    );
    const rows = [...many, row(500, "Late projector", "Engineering")];
    expect(toContextItems(rows).some((i) => i.name === "Late projector")).toBe(
      false,
    );
    const found = searchItems(
      toSearchEntries(rows),
      { keywords: ["projector"], departmentName: "" },
      "projector?",
    );
    expect(found.matches.map((i) => i.name)).toEqual(["Late projector"]);
  });

  it("lists at most ten records and says how many there are", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(200 + i, `Chair ${String(i).padStart(2, "0")}`, "Science"),
    );
    const reply = groundReply(
      {
        intent: "find_items",
        answer: "x",
        itemIds: [],
        requestIds: [],
        search: { keywords: ["chair"] },
      },
      { ...ctx, catalogue: toSearchEntries(rows) },
      "chairs?",
    );
    expect(reply?.items).toHaveLength(10);
    expect(reply?.answer).toBe(
      'I found 12 available catalogue items matching "chair". Here are the first 10; use the catalogue search to see them all.',
    );
  });

  it("matches singular and plural forms", () => {
    expect(stemWord("projectors")).toBe("projector");
    expect(stemWord("benches")).toBe("bench");
    expect(stemWord("batteries")).toBe("battery");
    expect(stemWord("glass")).toBe("glass");
    expect(stemWord("glasses")).toBe("glass");
  });

  it("asks the model for a search description, not a list", () => {
    const prompt = JSON.stringify(buildPrompt("chairs?", ctx, "2026-11-19"));
    expect(prompt).toContain("search.keywords");
    expect(prompt).toContain('"search":{"type":"object"');
  });
});

describe("AI #4 provider retry (issue 1)", () => {
  const ok = geminiReply({
    intent: "request_status",
    answer: "Statuses below.",
    itemIds: [],
    requestIds: [REQUEST],
  });
  it("retries a transient provider error once and answers", async () => {
    const provider = vi
      .fn()
      .mockRejectedValueOnce(Error("provider_503"))
      .mockResolvedValueOnce(ok);
    const { handler, request, log } = setup(provider);
    const body = await (
      await handler(request({ question: "status of my requests?" }))
    ).json();
    expect(provider).toHaveBeenCalledTimes(2);
    expect(body.grounded).toBe(true);
    expect(body.requests[0].requestId).toBe(REQUEST);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("ai4 provider retry cause=provider_503"),
    );
  });
  it("retries only once and then reports the provider as unavailable", async () => {
    const provider = vi.fn(async () => {
      throw Error("provider_503");
    });
    const { handler, request, log } = setup(provider);
    expect(
      await (await handler(request({ question: "monitors?" }))).json(),
    ).toEqual({ error: { code: "provider" } });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("outcome=error code=provider cause=provider_503"),
    );
  });
  it("does not retry quota, configuration or timeout failures", async () => {
    for (const message of ["provider_429", "provider_unconfigured"]) {
      const provider = vi.fn(async () => {
        throw Error(message);
      });
      const { handler, request } = setup(provider);
      await handler(request({ question: "monitors?" }));
      expect(provider).toHaveBeenCalledTimes(1);
    }
    expect(isTransientProviderError(Error("provider_500"))).toBe(true);
    expect(isTransientProviderError(Error("provider_504"))).toBe(true);
    expect(isTransientProviderError(Error("provider_400"))).toBe(false);
    expect(isTransientProviderError(Error("TimeoutError"))).toBe(false);
  });
  it("offers Try again only where asking again can help", () => {
    for (const code of ["provider", "timeout", "quota", "context"])
      expect(isRetryableAssistantError(code)).toBe(true);
    for (const code of ["validation", "unauthorized", "unconfigured"])
      expect(isRetryableAssistantError(code)).toBe(false);
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
