import { test, expect, type Page } from "@playwright/test";
// @ts-expect-error The isolated database harness is a Node-only JavaScript module.
import { testDatabase } from "../../scripts/workflow-test-support.mjs";
import { createAi5GenerateHandler } from "../../supabase/functions/ai5-generate/handler";

// These flows run the real SQL migration through PGlite, with synthetic Auth and
// HTTP adapters. They establish UI-to-database behavior, not live Supabase Auth.
async function project(page: Page) {
  const h = await testDatabase();
  let user = h.requester;
  let failAfterCommit = false;
  let reportProviderUnavailable = false;
  // Synthetic AI #2 output; null keeps the default outage response.
  let matchRecommendations: Record<string, unknown>[] | null = null;
  const calls: Record<string, unknown>[] = [];
  const stock = await h.asset(4);
  const users: Record<string, any> = {
    requester: h.requester,
    supplier: h.rep,
    facilities: h.facilities,
    receiver: h.receiver,
    admin: h.person("business_administrator"),
  };
  const query = async (sql: string, args: unknown[] = []) =>
    (await h.as(user, sql, args)).rows[0].result;
  // Real report handler and database contracts; only Auth and Gemini are synthetic.
  const reports = createAi5GenerateHandler({
    allowedOrigins: [],
    gateway: {
      authenticate: async () => user.userId,
      context: async (_token, id) =>
        query("select public.ai5_generation_context($1) result", [id]),
      replay: async (_token, id, key) =>
        query("select public.ai5_generation_replay($1,$2) result", [id, key]),
      save: async (_token, id, key, model, summary, metadata) =>
        query(
          "select public.ai5_save_generation($1,$2,$3,$4,$5::jsonb) result",
          [id, key, model, summary, JSON.stringify(metadata)],
        ),
    },
    provider: async () => {
      if (reportProviderUnavailable) throw Error("provider unavailable");
      return {
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    headline: "Recorded campus activity",
                    demand: "Request activity is recorded in the snapshot",
                    transferActivity:
                      "Completed transfers follow accepted receipt",
                    interpretation:
                      "Review the displayed facts alongside this summary",
                    limitation: "Synthetic coursework records only",
                  }),
                },
              ],
            },
          },
        ],
      };
    },
  });
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:5174",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    };
    const send = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const auth = () => ({
      id: user.userId,
      aud: "authenticated",
      role: "authenticated",
      email: "synthetic@demo.example.test",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-11-09T00:00:00Z",
    });
    if (path === "/auth/v1/token") {
      user = users[request.postDataJSON().email.split("@")[0]];
      const enc = (v: unknown) =>
        Buffer.from(JSON.stringify(v)).toString("base64url");
      return send({
        access_token: `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: user.userId, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`,
        refresh_token: "synthetic",
        expires_in: 3600,
        token_type: "bearer",
        user: auth(),
      });
    }
    if (path === "/auth/v1/user") return send(auth());
    if (path === "/auth/v1/logout") return send({});
    const name = path.split("/").at(-1),
      body = request.postDataJSON();
    try {
      let result;
      if (name === "ai2-match") {
        if (matchRecommendations)
          return send({
            outcome: "completed",
            runId: "00000000-0000-4000-8000-00000000a201",
            requestId: body.requestId,
            recommendations: matchRecommendations,
          });
        return send({ error: { code: "provider_unavailable" } }, 503);
      } else if (name === "ai5-generate") {
        const response = await reports(
          new Request("http://test/functions/v1/ai5-generate", {
            method: "POST",
            headers: {
              authorization: "Bearer synthetic",
              apikey: "sb_publishable_test",
            },
            body: JSON.stringify(body),
          }),
        );
        return send(await response.json(), response.status);
      } else if (name === "ai5_capture_report")
        result = await query("select public.ai5_capture_report($1) result", [
          body.p_idempotency_key,
        ]);
      else if (
        name === "ai5_narrative_workspace" ||
        name === "ai5_published_narratives"
      )
        result = await query(
          name === "ai5_narrative_workspace"
            ? "select coalesce(jsonb_agg(x),'[]'::jsonb) result from public.ai5_narrative_workspace() x"
            : "select coalesce(jsonb_agg(x),'[]'::jsonb) result from public.ai5_published_narratives() x",
        );
      else if (name === "ai5_edit_narrative")
        result = await query("select public.ai5_edit_narrative($1,$2) result", [
          body.p_id,
          body.p_text,
        ]);
      else if (name === "ai5_mark_ready")
        result = await query("select public.ai5_mark_ready($1) result", [
          body.p_id,
        ]);
      else if (name === "ai5_publish_narrative")
        result = await query("select public.ai5_publish_narrative($1) result", [
          body.p_id,
        ]);
      else if (name === "foundation_bootstrap")
        result = (
          await h.as(user, "select public.foundation_bootstrap() result")
        ).rows[0].result;
      else if (name === "search_assets")
        result = (
          await h.as(user, "select public.search_assets($1::jsonb) result", [
            JSON.stringify(body.p_filters),
          ])
        ).rows[0].result;
      else if (name === "asset_detail")
        result = (
          await h.as(user, "select public.asset_detail($1,$2) result", [
            body.p_asset_id,
            body.p_portion_id,
          ])
        ).rows[0].result;
      else if (name === "workflow_workspace") result = await h.workspace(user);
      else if (name === "c9_activity_report")
        result = (
          await h.as(
            user,
            "select public.c9_activity_report($1,$2,$3) result",
            [body.p_start, body.p_end, body.p_department],
          )
        ).rows[0].result;
      else if (name === "workflow_command") {
        calls.push(body.p_input);
        result = await h.command(user, body.p_input);
        if (failAfterCommit) {
          failAfterCommit = false;
          return route.abort("failed");
        }
      } else return send({ message: "Unexpected route " + name }, 400);
      return send(result);
    } catch (e) {
      return send({ code: "P0001", message: (e as Error).message }, 400);
    }
  });
  async function login(role: string, openWorkflows = true) {
    if (
      await page.getByRole("button", { name: "Sign out", exact: true }).count()
    )
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
    else await page.goto("/");
    await page.getByRole("button", { name: "Sign in to continue" }).click();
    await page.getByLabel("Email address").fill(role + "@demo.example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("synthetic-test-password");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    if (!openWorkflows) return;
    await page
      .getByRole("button", { name: "Requests and transfers", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Request tracking", exact: true }),
    ).toBeVisible();
  }
  async function requestForm(purpose = "Synthetic UI teaching need") {
    await page
      .getByRole("button", { name: "New request", exact: true })
      .click();
    await page.getByLabel("Purpose", { exact: true }).fill(purpose);
    await page
      .getByLabel("Request category")
      .selectOption(h.fixture.categories[0].categoryId);
    await page.getByLabel("Requested quantity").fill("3");
    await page.getByLabel("Required date").fill(h.requiredDate);
    await page
      .getByLabel("Receiving destination")
      .fill("Science / Teaching lab");
    await page
      .getByRole("button", { name: "Add requirement", exact: true })
      .click();
    await page.getByLabel("Requirement", { exact: true }).fill("connector");
    await page.getByLabel("Required value", { exact: true }).fill("HDMI");
  }
  return {
    h,
    stock,
    calls,
    login,
    requestForm,
    setReportUnavailable: (unavailable: boolean) => {
      reportProviderUnavailable = unavailable;
    },
    setMatchRecommendations: (rows: Record<string, unknown>[] | null) => {
      matchRecommendations = rows;
    },
    failNextResponse: () => {
      failAfterCommit = true;
    },
  };
}
test("request through separate approval/release, assigned dispatch and accepted receipt", async ({
  page,
}) => {
  const p = await project(page);
  try {
    await p.login("requester");
    await p.requestForm();
    await page
      .getByRole("button", { name: "Submit request", exact: true })
      .click();
    const requestCard = page.getByRole("article", {
      name: "Request Synthetic UI teaching need",
      exact: true,
    });
    await expect(
      requestCard
        .getByText("Remaining", { exact: true })
        .locator("..")
        .getByRole("definition"),
    ).toHaveText("3");
    await page
      .getByRole("navigation", { name: "Workflow sections" })
      .getByRole("button", { name: "Interests", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Open request", exact: true })
      .selectOption({ label: "Synthetic UI teaching need (3 remaining)" });
    await page.getByLabel("Published item").selectOption(p.stock.portionId);
    await page.getByLabel("Selection note").fill("HDMI evidence reviewed");
    await page
      .getByRole("button", { name: "Record Interest", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Workflow sections" })
      .getByRole("button", { name: "Requests", exact: true })
      .click();
    await expect(
      requestCard
        .getByText("Allocated", { exact: true })
        .locator("..")
        .getByRole("definition"),
    ).toHaveText("0");
    await p.login("supplier");
    await page
      .getByRole("navigation", { name: "Workflow sections" })
      .getByRole("button", { name: "Interests", exact: true })
      .click();
    const interest = page.getByRole("article", {
      name: "Interest " + p.stock.name,
      exact: true,
    });
    await expect(interest).toContainText(
      "Requester selection note: HDMI evidence reviewed",
    );
    await interest
      .locator("summary")
      .filter({ hasText: "Approve reservation" })
      .click();
    await interest
      .getByLabel("Reason", { exact: true })
      .first()
      .fill("Teaching lab timing and specifications reviewed");
    await interest
      .getByRole("button", { name: "Approve reservation", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Workflow sections" })
      .getByRole("button", { name: "Transfers", exact: true })
      .click();
    const card = page.getByRole("article", {
      name: "Transfer " + p.stock.name,
      exact: true,
    });
    await expect(card).toContainText("Pending Approval");
    await card.getByLabel("Transfer action").selectOption("approveRelease");
    await card
      .getByLabel("Assigned Facilities")
      .selectOption(p.h.facilities.userId);
    await card
      .getByLabel("Reason", { exact: true })
      .fill("Ready for Facilities");
    await card
      .getByRole("button", { name: "Approve release", exact: true })
      .click();
    await expect(card.getByRole("heading", { level: 3 })).toContainText(
      "Approved",
    );
    await expect(card).toContainText(
      "Assigned Facilities staff: arrange pickup.",
    );
    await p.login("facilities");
    await page
      .getByRole("navigation", { name: "Workflow sections" })
      .getByRole("button", { name: "Transfers", exact: true })
      .click();
    await card.getByLabel("Transfer action").selectOption("schedule");
    // datetime-local follows the browser's local timezone.
    const slot = await page.evaluate(() => {
      const d = new Date(Date.now() + 3600000);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    });
    await card.getByLabel("Pickup date and time").fill(slot);
    await card
      .getByLabel("Transport arrangements")
      .fill("Trolley at east entrance");
    await card.getByLabel("Reason", { exact: true }).fill("Pickup agreed");
    await card
      .getByRole("button", { name: "Schedule pickup", exact: true })
      .click();
    await expect(card).toContainText("record dispatch");
    await card.getByLabel("Transfer action").selectOption("dispatch");
    await card
      .getByLabel("Actual physical location")
      .fill("Facilities / Trolley");
    await card
      .getByLabel("Reason", { exact: true })
      .fill("Collected full batch");
    await card
      .getByRole("button", { name: "Record dispatch", exact: true })
      .click();
    await expect(card).toContainText("In Transit");
    await expect(card).toContainText("Engineering / Store");
    await p.login("receiver");
    await page
      .getByRole("navigation", { name: "Workflow sections" })
      .getByRole("button", { name: "Transfers", exact: true })
      .click();
    await card.getByLabel("Transfer action").selectOption("receive");
    await card
      .getByLabel("Reason", { exact: true })
      .fill("Full batch inspected and accepted");
    await card
      .getByRole("button", { name: "Record receipt", exact: true })
      .click();
    await expect(card).toContainText("Completed");
    await page
      .getByRole("navigation", { name: "Workflow sections" })
      .getByRole("button", { name: "Requests", exact: true })
      .click();
    await expect(
      requestCard
        .getByText("Accepted", { exact: true })
        .locator("..")
        .getByRole("definition"),
    ).toHaveText("3");
    await expect(requestCard).toContainText("Fulfilled");
    await page
      .getByRole("navigation", { name: "Workflow sections" })
      .getByRole("button", { name: "History", exact: true })
      .click();
    await expect(
      page.getByText("Receipt recorded", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/workflow-accepted.png",
      fullPage: true,
    });
  } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
    await p.h.db.close();
  }
});

test("AI match strength is judged against the evidence on record, not a fixed rank of 60", async ({
  page,
}) => {
  const p = await project(page);
  try {
    await p.h.request(3);
    // ai2-match records these warnings today, which caps the rank at 60.
    const missingEvidence = [
      "Delivery timing unavailable",
      "Location evidence unavailable",
      "Transfer and repair costs unavailable",
      "Diverted fraction unavailable",
      "Avoided-emissions evidence unavailable",
    ];
    const recommendation = (rank: number, name: string, compat: number) => ({
      recommendationId: `00000000-0000-4000-8000-00000000a21${rank}`,
      portionId: p.stock.portionId,
      assetId: p.stock.assetId,
      rank,
      assetName: name,
      condition: "Good",
      availableQty: 4,
      compatibilityScore: compat,
      finalRankScore: 0.6 * compat,
      reason: "Synthetic recommendation",
      missingEvidence,
      reviewState: "pending",
    });
    p.setMatchRecommendations([
      recommendation(1, "Strong synthetic display", 81),
      recommendation(2, "Loose synthetic display", 50),
    ]);
    await p.login("requester");
    await page
      .getByRole("button", { name: "Get AI recommendations", exact: true })
      .click();
    const strong = page.getByRole("article", {
      name: "AI recommendation Strong synthetic display",
      exact: true,
    });
    const loose = page.getByRole("article", {
      name: "AI recommendation Loose synthetic display",
      exact: true,
    });
    await expect(strong).toContainText("Compatibility: 81.0 / 100");
    await expect(strong).toContainText("Ranking score: 48.6 of 60 possible");
    await expect(strong.getByText("Good match", { exact: true })).toBeVisible();
    await expect(strong.getByText("Weak match", { exact: true })).toHaveCount(
      0,
    );
    await expect(loose.getByText("Weak match", { exact: true })).toBeVisible();
    await strong.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/ai2-match-strength.png",
      fullPage: false,
    });
  } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
    await p.h.db.close();
  }
});

test("AI matching outage leaves manual interest selection usable and does not allocate stock", async ({
  page,
}) => {
  const p = await project(page);
  try {
    const request = await p.h.request(3);
    await p.login("requester");
    await page
      .getByRole("button", { name: "Get AI recommendations", exact: true })
      .click();
    const fallback = page
      .getByRole("status")
      .filter({ hasText: "Recommendations are temporarily unavailable" });
    await expect(fallback).toBeVisible();
    await fallback
      .getByRole("button", { name: "Find catalogue items", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Open request", exact: true }),
    ).toHaveValue(request.requestId);
    await page.getByLabel("Published item").selectOption(p.stock.portionId);
    await page
      .getByLabel("Selection note")
      .fill("Conventional search after AI outage");
    await page
      .getByRole("button", { name: "Record Interest", exact: true })
      .click();
    const interest = page.getByRole("article", {
      name: "Interest " + p.stock.name,
      exact: true,
    });
    await expect(interest).toContainText("Pending");
    const workspace = await p.h.workspace(p.h.requester);
    expect(
      workspace.requests.find((q: any) => q.requestId === request.requestId)
        .allocatedQty,
    ).toBe(0);
    expect(workspace.transfers).toHaveLength(0);
  } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
    await p.h.db.close();
  }
});

test("calculated report survives an AI outage and requires human editing and publication", async ({
  page,
}) => {
  const p = await project(page);
  try {
    const { t } = await p.h.dispatched(2);
    await p.h.transfer(p.h.receiver, t, "receive", {
      qty: 2,
      condition: "Good",
      accept: true,
      location: "Science / Lab",
    });
    await p.login("admin", false);
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await page
      .getByRole("button", { name: "Capture snapshot", exact: true })
      .click();
    const reports = page.getByRole("region", { name: "Reports", exact: true });
    await expect(
      reports
        .getByText("Units transferred", { exact: true })
        .locator("..")
        .getByRole("definition"),
    ).toHaveText("2");
    p.setReportUnavailable(true);
    await page
      .getByRole("button", { name: "Generate summary", exact: true })
      .click();
    await expect(reports.getByRole("alert")).toBeVisible();
    await expect(
      reports
        .getByText("Units transferred", { exact: true })
        .locator("..")
        .getByRole("definition"),
    ).toHaveText("2");
    p.setReportUnavailable(false);
    await page
      .getByRole("button", { name: "Generate summary", exact: true })
      .click();
    const draft = page.getByRole("textbox", {
      name: /^Draft narrative/,
    });
    await expect(draft).toHaveValue(/Recorded campus activity/);
    const generated = await draft.inputValue();
    await expect(
      page.getByRole("button", { name: "Publish", exact: true }),
    ).toHaveCount(0);
    await draft.fill(
      generated.replace("Recorded campus activity", "99999 units transferred"),
    );
    await page.getByRole("button", { name: "Save edit", exact: true }).click();
    // The validation error sits inside the report card beside the editor and
    // takes focus, instead of appearing at the top of the page.
    const cardAlert = reports.getByRole("article").getByRole("alert");
    await expect(cardAlert).toContainText("Narrative numbers must match");
    await expect(cardAlert).toBeFocused();
    await expect(cardAlert).toBeInViewport();
    await page.screenshot({
      path: "test-results/report-validation-in-card.png",
      fullPage: false,
    });
    await draft.fill(
      generated.replace("Recorded campus activity", "Reviewed campus activity"),
    );
    await expect(
      page.getByRole("button", { name: "Mark ready", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Save edit", exact: true }).click();
    await expect(reports.getByRole("status")).toContainText("Draft saved");
    await page.getByRole("button", { name: "Mark ready", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(reports.getByText("Published", { exact: true })).toBeVisible();
    await page.screenshot({
      path: "test-results/report-human-reviewed.png",
      fullPage: true,
    });
    await p.login("requester");
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Reports", exact: true }),
    ).toContainText("Reviewed campus activity");
    await expect(
      page.getByRole("button", { name: "Capture snapshot", exact: true }),
    ).toHaveCount(0);
  } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
    await p.h.db.close();
  }
});
test("financial costs stay hidden from requester and Facilities tracking while representatives can read them", async ({
  page,
}) => {
  const p = await project(page);
  try {
    const req = await p.h.request();
    let t = await p.h.approve(await p.h.interest(req, p.stock));
    t = await p.h.transfer(p.h.rep, t, "approveRelease", {
      facilitiesId: p.h.facilities.userId,
    });
    t = await p.h.transfer(p.h.facilities, t, "schedule", {
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      arrangements: "Privacy regression pickup at east entrance",
      handlingCost: 12.5,
      transportCost: 45.5,
    });
    const card = page.getByRole("article", {
      name: "Transfer " + p.stock.name,
      exact: true,
    });
    for (const actor of ["requester", "facilities"]) {
      await p.login(actor);
      await page
        .getByRole("navigation", { name: "Workflow sections" })
        .getByRole("button", { name: "Transfers", exact: true })
        .click();
      await expect(card).toContainText(
        "Privacy regression pickup at east entrance",
      );
      await expect(card).toContainText("Scheduled");
      await expect(card).not.toContainText("Handling:");
      await expect(card).not.toContainText("Transport:");
      await expect(card).not.toContainText("unrecorded");
    }
    for (const actor of ["supplier", "receiver"]) {
      await p.login(actor);
      await page
        .getByRole("navigation", { name: "Workflow sections" })
        .getByRole("button", { name: "Transfers", exact: true })
        .click();
      await expect(card).toContainText("Handling: 12.5 AED");
      await expect(card).toContainText("Transport: 45.5 AED");
    }
    await p.h.transfer(p.h.facilities, t, "schedule", {
      scheduledAt: new Date(Date.now() + 7200000).toISOString(),
      arrangements: "Privacy regression pickup at east entrance",
      handlingCost: 0,
      transportCost: null,
    });
    await p.login("supplier");
    await page
      .getByRole("navigation", { name: "Workflow sections" })
      .getByRole("button", { name: "Transfers", exact: true })
      .click();
    await expect(card).toContainText("Handling: 0 AED");
    await expect(card).toContainText("Transport: unrecorded AED");
  } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
    await p.h.db.close();
  }
});

test("split and mixed-owner stock hides catalogue actions that the database forbids", async ({
  page,
}) => {
  const p = await project(page);
  try {
    const req = await p.h.request(3),
      i = await p.h.interest(req, p.stock, 2);
    let t = await p.h.approve(i, 2);
    await p.login("supplier");
    const inspect = async () => {
      await page
        .getByRole("button", { name: "Resource catalogue", exact: true })
        .click();
      await page
        .getByRole("button", { name: `View ${p.stock.name}`, exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog")
          .getByText("Catalogue actions are unavailable", { exact: false }),
      ).toBeVisible();
      for (const name of ["Edit record", "Publish surplus", "Withdraw listing"])
        await expect(
          page.getByRole("dialog").getByRole("button", { name, exact: true }),
        ).toHaveCount(0);
    };
    await inspect(); // Same owner, but the sibling portion is allocated.
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close dialog" })
      .click();
    t = await p.h.transfer(p.h.rep, t, "approveRelease", {
      facilitiesId: p.h.facilities.userId,
    });
    t = await p.h.transfer(p.h.facilities, t, "schedule", {
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      arrangements: "Trolley",
    });
    t = await p.h.transfer(p.h.facilities, t, "dispatch", {
      qty: 2,
      location: "Facilities / Trolley",
    });
    await p.h.transfer(p.h.receiver, t, "receive", {
      qty: 2,
      condition: "Good",
      accept: true,
      location: "Science / Lab",
    });
    await p.login("supplier");
    await inspect(); // The accepted portion now has another owner.
  } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
    await p.h.db.close();
  }
});

test("uncertain committed response retains request entries and reuses operation key", async ({
  page,
}) => {
  const p = await project(page);
  try {
    await p.login("requester");
    await p.requestForm("Retry demonstration");
    p.failNextResponse();
    await page
      .getByRole("button", { name: "Submit request", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue(
      "Retry demonstration",
    );
    await page
      .getByRole("button", { name: "Submit request", exact: true })
      .click();
    await expect(
      page.getByRole("article", {
        name: "Request Retry demonstration",
        exact: true,
      }),
    ).toBeVisible();
    expect(p.calls).toHaveLength(2);
    expect(p.calls[0].operationKey).toBe(p.calls[1].operationKey);
    expect(
      (await p.h.workspace(p.h.requester)).requests.filter(
        (q: any) => q.purpose === "Retry demonstration",
      ),
    ).toHaveLength(1);
  } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
    await p.h.db.close();
  }
});
test("stale request selection preserves entered note; mobile tracking has no overflow", async ({
  page,
}) => {
  const p = await project(page);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await p.login("requester");
    const req = await p.h.request(3);
    await page.getByRole("button", { name: "Reload workflows" }).click();
    await page
      .getByRole("navigation", { name: "Workflow sections" })
      .getByRole("button", { name: "Interests", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Open request", exact: true })
      .selectOption(req.requestId);
    await page.getByLabel("Published item").selectOption(p.stock.portionId);
    await page
      .getByLabel("Selection note")
      .fill("Preserve my note after conflict");
    await p.h.interest(req, p.stock, 1); // another session changes request version
    await page
      .getByRole("button", { name: "Record Interest", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "stale request version",
    );
    await expect(page.getByLabel("Selection note")).toHaveValue(
      "Preserve my note after conflict",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/workflow-mobile.png",
      fullPage: true,
    });
  } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
    await p.h.db.close();
  }
});

test("C9 activity report lists permitted requests/transfers and exports CSV", async ({
  page,
}) => {
  const p = await project(page);
  try {
    const { t } = await p.h.dispatched(2);
    await p.login("requester");
    await page
      .getByRole("button", { name: "Activity report", exact: true })
      .click();
    const requests = page.getByRole("region", {
      name: "Requests",
      exact: true,
    });
    const transfers = page.getByRole("region", {
      name: "Transfers",
      exact: true,
    });
    await expect(requests.getByRole("row")).toHaveCount(2);
    await expect(transfers).toContainText("In Transit");
    await expect(transfers).toContainText(t.transferId.slice(0, 8));
    await expect(
      page.getByText("Showing only records you can access."),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await transfers
      .getByRole("button", { name: "Export CSV", exact: true })
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^campus-transfers-.*\.csv$/);
    const csv = (await import("node:fs")).readFileSync(
      await file.path(),
      "utf8",
    );
    expect(csv.split("\r\n")[0]).toBe(
      "\uFEFFTransfer,Request,Asset,Qty,From,To,State,Scheduled,Dispatched,Received",
    );
    expect(csv).toContain(`${t.transferId.slice(0, 8)},`);
    expect(csv).toContain("In Transit");
  } finally {
    await p.h.db.close();
  }
});

test("request draft survives navigation, clears on submit and never crosses logout", async ({
  page,
}) => {
  const p = await project(page);
  try {
    await p.login("requester");
    await p.requestForm("Private unsent draft");
    await page
      .getByRole("button", { name: "Resource catalogue", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Requests and transfers", exact: true })
      .click();
    await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue(
      "Private unsent draft",
    );
    await expect(page.getByLabel("Requested quantity")).toHaveValue("3");
    await expect(
      page.getByLabel("Required value", { exact: true }),
    ).toHaveValue("HDMI");
    await page
      .getByRole("button", { name: "Submit request", exact: true })
      .click();
    await expect(
      page.getByRole("article", {
        name: "Request Private unsent draft",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Resource catalogue", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Requests and transfers", exact: true })
      .click();
    await page
      .getByRole("button", { name: "New request", exact: true })
      .click();
    await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue("");
    await page
      .getByLabel("Purpose", { exact: true })
      .fill("Private second draft");
    await p.login("receiver");
    await page
      .getByRole("button", { name: "New request", exact: true })
      .click();
    await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue("");
    await expect(
      page.getByText("Private second draft", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await p.h.db.close();
  }
});
