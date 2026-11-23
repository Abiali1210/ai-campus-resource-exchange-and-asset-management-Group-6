import { test, expect } from "@playwright/test";
// @ts-expect-error The isolated database harness is a Node-only JavaScript module.
import { testDatabase } from "../../scripts/workflow-test-support.mjs";

// Real SQL migrations through PGlite with synthetic Auth and HTTP adapters, as in
// workflows.spec.ts. A batch split between two departments used to show
// "Asset history (0)" to the receiving representative.
test("receiving representative sees the transferred batch's trail with names in the asset record", async ({
  page,
}) => {
  const h = await testDatabase();
  try {
    const stock = await h.asset(5),
      req = await h.request(2),
      i = await h.interest(req, stock, 2);
    let t = await h.approve(i, 2);
    t = await h.transfer(h.rep, t, "approveRelease", {
      facilitiesId: h.facilities.userId,
    });
    t = await h.transfer(h.facilities, t, "schedule", {
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      arrangements: "Trolley at east entrance",
    });
    t = await h.transfer(h.facilities, t, "dispatch", {
      qty: 2,
      location: "Facilities / Trolley",
    });
    await h.transfer(h.receiver, t, "receive", {
      qty: 2,
      condition: "Good",
      accept: true,
      location: "Science / Store",
    });
    const user = h.receiver;
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
      const auth = {
        id: user.userId,
        aud: "authenticated",
        role: "authenticated",
        email: "receiver@demo.example.test",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-11-09T00:00:00Z",
      };
      if (path === "/auth/v1/token") {
        const enc = (v: unknown) =>
          Buffer.from(JSON.stringify(v)).toString("base64url");
        return send({
          access_token: `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: user.userId, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`,
          refresh_token: "synthetic",
          expires_in: 3600,
          token_type: "bearer",
          user: auth,
        });
      }
      if (path === "/auth/v1/user") return send(auth);
      if (path === "/auth/v1/logout") return send({});
      const name = path.split("/").at(-1),
        body = request.postDataJSON();
      const query = async (sql: string, args: unknown[] = []) =>
        (await h.as(user, sql, args)).rows[0].result;
      try {
        if (name === "foundation_bootstrap")
          return send(
            await query("select public.foundation_bootstrap() result"),
          );
        if (name === "search_assets")
          return send(
            await query("select public.search_assets($1::jsonb) result", [
              JSON.stringify(body.p_filters),
            ]),
          );
        if (name === "asset_detail")
          return send(
            await query("select public.asset_detail($1,$2) result", [
              body.p_asset_id,
              body.p_portion_id,
            ]),
          );
        return send({ message: "Unexpected route " + name }, 400);
      } catch (e) {
        return send({ code: "P0001", message: (e as Error).message }, 400);
      }
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in to continue" }).click();
    await page.getByLabel("Email address").fill("receiver@demo.example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("synthetic-test-password");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Department inventory", exact: true })
      .click();
    await page
      .getByRole("button", { name: `View ${stock.name}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("2 / 5 units", { exact: true }),
    ).toBeVisible();
    const section = dialog.locator(".asset-history");
    await section
      .locator("summary")
      .filter({ hasText: "Asset history (5)" })
      .click();
    const rows = section.locator(".history-row");
    await expect(rows.locator("strong")).toHaveText([
      "Receipt recorded",
      "Dispatched",
      "Pickup scheduled",
      "Release approved",
      "Reservation approved",
    ]);
    await expect(rows.locator("small").filter({ hasText: /^By / })).toHaveText([
      `By ${h.receiver.name}`,
      `By ${h.facilities.name}`,
      `By ${h.facilities.name}`,
      `By ${h.rep.name}`,
      `By ${h.rep.name}`,
    ]);
    const visible = await section.innerText();
    expect(visible).not.toMatch(/\b(asset|transfer|reservation)\.[A-Za-z_]+/);
    expect(visible).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/asset-history-transferred-batch.png",
    });
  } finally {
    if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
    await h.db.close();
  }
});
