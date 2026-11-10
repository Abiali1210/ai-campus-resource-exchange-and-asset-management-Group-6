import { test, expect, type Page } from "@playwright/test";
// @ts-expect-error The isolated database harness is a Node-only JavaScript module.
import { testDatabase } from "../../scripts/workflow-test-support.mjs";

// These flows run the real SQL migration through PGlite, with synthetic Auth and
// HTTP adapters. They establish UI-to-database behavior, not live Supabase Auth.
async function project(page: Page) {
  const h = await testDatabase();
  let user = h.requester;
  let failAfterCommit = false;
  const calls: Record<string, unknown>[] = [];
  const stock = await h.asset(4);
  const users: Record<string, any> = {
    requester: h.requester,
    supplier: h.rep,
    facilities: h.facilities,
    receiver: h.receiver,
  };
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
      if (name === "foundation_bootstrap")
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
  async function login(role: string) {
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
    await page
      .getByRole("button", { name: "Requests and transfers", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Request tracking", exact: true }),
    ).toBeVisible();
  }
  async function requestForm(purpose = "Synthetic UI teaching need") {
    await page.getByText("Submit a resource request", { exact: true }).click();
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
      .getByLabel("Mandatory specifications (JSON object)")
      .fill('{"connector":"HDMI"}');
  }
  return {
    h,
    stock,
    calls,
    login,
    requestForm,
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
    await expect(requestCard).toContainText("Remaining 3");
    await page
      .getByText("Select a published item for Interest", { exact: true })
      .click();
    await page
      .getByLabel("Open request")
      .selectOption({ label: "Synthetic UI teaching need (3 remaining)" });
    await page.getByLabel("Published item").selectOption(p.stock.portionId);
    await page.getByLabel("Selection note").fill("HDMI evidence reviewed");
    await page
      .getByRole("button", { name: "Record Interest", exact: true })
      .click();
    await expect(requestCard).toContainText("Actively allocated 0");
    await p.login("supplier");
    const interest = page.getByRole("article", {
      name: "Interest " + p.stock.name,
      exact: true,
    });
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
    await expect(card).toContainText("Assigned Facilities: schedule pickup");
    await p.login("facilities");
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
    await card.getByLabel("Transfer action").selectOption("receive");
    await card
      .getByLabel("Reason", { exact: true })
      .fill("Full batch inspected and accepted");
    await card
      .getByRole("button", { name: "Record receipt", exact: true })
      .click();
    await expect(card).toContainText("Completed");
    await expect(requestCard).toContainText("Accepted 3");
    await expect(requestCard).toContainText("Fulfilled");
    await page
      .getByText("Workflow history: who did what and when", { exact: true })
      .click();
    await expect(
      page.getByText("Receipt recorded", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/workflow-accepted.png",
      fullPage: true,
    });
  } finally {
    await page.unrouteAll({ behavior: "wait" });
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
    await expect(card).toContainText("Handling: 0 AED");
    await expect(card).toContainText("Transport: unrecorded AED");
  } finally {
    await page.unrouteAll({ behavior: "wait" });
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
    await page.unrouteAll({ behavior: "wait" });
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
    await page.unrouteAll({ behavior: "wait" });
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
      .getByText("Select a published item for Interest", { exact: true })
      .click();
    await page.getByLabel("Open request").selectOption(req.requestId);
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
    await page.unrouteAll({ behavior: "wait" });
    await p.h.db.close();
  }
});
