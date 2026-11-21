import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/foundation.json", import.meta.url), "utf8"),
);

async function project(page: Page) {
  const profiles = fixture.users.filter((p: any) =>
    p.roles.includes("requester"),
  );
  let actor = profiles[0];
  const state = {
    failCatalogue: false,
    saved: null as any,
    assistantCalls: 0,
    release: () => {},
    failReply: false,
  };
  let row = {
    ...fixture.assets[0],
    ...fixture.stockPortions[0],
    categoryName: "Monitors",
    departmentName: "Engineering",
    canEdit: true,
    specifications: {
      connector: "HDMI",
      screenInches: 24,
      adjustable: true,
      features: { height: true },
      ports: ["HDMI"],
      unknown: null,
    },
  };
  const gate = new Promise<void>((resolve) => {
    state.release = resolve;
  });
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:5174",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
      "Content-Type": "application/json",
    };
    const send = (data: unknown, status = 200) =>
      route.fulfill({ status, headers, body: JSON.stringify(data) });
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const auth = () => ({
      id: actor.userId,
      aud: "authenticated",
      role: "authenticated",
      email: actor.userId + "@demo.test",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-11-08T00:00:00Z",
    });
    if (path === "/auth/v1/token") {
      const name = req.postDataJSON().email.split("@")[0];
      actor =
        name === "second"
          ? profiles[1]
          : name === "representative"
            ? fixture.users.find((p: any) => p.roles.includes("representative"))
            : profiles[0];
      const enc = (x: unknown) =>
        Buffer.from(JSON.stringify(x)).toString("base64url");
      return send({
        access_token: `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: actor.userId, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`,
        refresh_token: "synthetic",
        expires_in: 3600,
        token_type: "bearer",
        user: auth(),
      });
    }
    if (path === "/auth/v1/user") return send(auth());
    if (path === "/auth/v1/logout") return send({});
    try {
      const id = JSON.parse(
        Buffer.from(
          req.headers().authorization.split(".")[1],
          "base64url",
        ).toString(),
      ).sub;
      actor = fixture.users.find((p: any) => p.userId === id) ?? actor;
    } catch {
      /* public key on pre-auth requests */
    }
    const name = path.split("/").at(-1);
    if (name === "foundation_bootstrap")
      return send({
        profile: actor,
        categories: fixture.categories,
        departments: fixture.departments,
        profiles: fixture.users,
      });
    if (name === "search_assets")
      return state.failCatalogue
        ? send({ message: "temporary failure" }, 503)
        : send([row]);
    if (name === "asset_detail")
      return send({ asset: row, attachments: [], history: [] });
    if (name === "save_asset") {
      state.saved = req.postDataJSON().p_input;
      row = { ...row, ...state.saved, version: row.version + 1 };
      return send(row);
    }
    if (name === "ai4-assistant") {
      const number = ++state.assistantCalls;
      if (number === 1) {
        await gate;
        if (state.failReply) return send({ error: { code: "context" } }, 503);
      }
      return send({
        intent: "request_status",
        answer:
          number === 1 ? "PRIVATE OLD ACCOUNT RECORD" : "Current account reply",
        items: [],
        requests: [],
        draft: null,
        grounded: true,
        model: "synthetic",
      });
    }
    return send({ message: "unexpected route" }, 500);
  });
  async function login(name = "first") {
    if (
      await page.getByRole("button", { name: "Sign out", exact: true }).count()
    )
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
    else await page.goto("/");
    await page
      .getByRole("button", { name: "Sign in to continue", exact: true })
      .click();
    await page
      .getByLabel("Email address", { exact: true })
      .fill(name + "@demo.test");
    await page.getByLabel("Password", { exact: true }).fill("synthetic-only");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
  }
  return { state, login, row };
}

for (const failure of [false, true])
  test(`discard pending assistant ${failure ? "error" : "success"} after account change`, async ({
    page,
  }) => {
    const p = await project(page);
    p.state.failReply = failure;
    await p.login();
    await page
      .getByRole("button", { name: "Campus assistant", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Ask the assistant", exact: true })
      .fill("my requests");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect.poll(() => p.state.assistantCalls).toBe(1);
    await p.login("second");
    await page
      .getByRole("button", { name: "Campus assistant", exact: true })
      .click();
    const oldResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/functions/v1/ai4-assistant") &&
        r.request().postDataJSON().question === "my requests",
    );
    p.state.release();
    await (await oldResponse).finished();
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("textbox", { name: "Ask the assistant", exact: true })
      .fill("current requests");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(
      page.getByText("Current account reply", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("PRIVATE OLD ACCOUNT RECORD", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

test("unchanged structured specifications survive a description-only save", async ({
  page,
}) => {
  const p = await project(page);
  await p.login("representative");
  await page
    .getByRole("button", { name: `View ${p.row.name}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Edit record", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Description-only change");
  await page
    .getByRole("button", { name: "Save asset record", exact: true })
    .click();
  await expect
    .poll(() => p.state.saved?.description)
    .toBe("Description-only change");
  expect(p.state.saved.specifications).toEqual(p.row.specifications);
  await expect(page.getByText("[object Object]", { exact: true })).toHaveCount(
    0,
  );
});

test("catalogue failure has a persistent unavailable state and recoverable retry", async ({
  page,
}) => {
  const p = await project(page);
  p.state.failCatalogue = true;
  await p.login();
  await expect(
    page.getByRole("button", { name: "Retry catalogue", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No resources match these filters.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /Available resources.*unavailable/ }),
  ).toBeVisible();
  p.state.failCatalogue = false;
  await page
    .getByRole("button", { name: "Retry catalogue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `View ${p.row.name}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry catalogue", exact: true }),
  ).toHaveCount(0);
});

test("a pending assistant reply is invalidated by an account switch in another tab", async ({
  page,
  context,
}) => {
  const p = await project(page);
  await p.login();
  await page
    .getByRole("button", { name: "Campus assistant", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Ask the assistant", exact: true })
    .fill("my requests");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect.poll(() => p.state.assistantCalls).toBe(1);
  const other = await context.newPage();
  const second = await project(other);
  await other.goto("/");
  await expect(
    other.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await second.login("second");
  const secondName = fixture.users.filter((p: any) =>
    p.roles.includes("requester"),
  )[1].name;
  await expect(page.getByText(secondName, { exact: true })).toBeVisible();
  const oldResponse = page.waitForResponse((r) =>
    r.url().includes("/functions/v1/ai4-assistant"),
  );
  p.state.release();
  await (await oldResponse).finished();
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: "Campus assistant", exact: true })
    .click();
  await expect(
    page.getByText("PRIVATE OLD ACCOUNT RECORD", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear chat", exact: true }),
  ).toHaveCount(0);
  await other.close();
});
