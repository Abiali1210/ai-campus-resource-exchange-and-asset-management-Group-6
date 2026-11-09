import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { AssetView, Profile } from "../../src/types";
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/foundation.json", import.meta.url), "utf8"),
);
const representative = fixture.users.find((u: Profile) =>
  u.roles.includes("representative"),
)!;
const assetData = fixture.assets[0],
  portion = fixture.stockPortions[0];
const initial = {
  ...assetData,
  ...portion,
  categoryName: "Monitors",
  departmentName: "Engineering",
  canEdit: true,
};
const profile = {
  ...representative,
  email: "representative@demo.example.test",
};
const authUser = {
  id: profile.userId,
  aud: "authenticated",
  role: "authenticated",
  email: profile.email,
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-11-08T00:00:00Z",
};
async function mockedProject(page: Page, role = "representative") {
  let row = { ...initial };
  const calls: string[] = [];
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:5174",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const send = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    if (path === "/auth/v1/token") {
      const encoded = (value: unknown) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
      const token = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: profile.userId, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`;
      return send({
        access_token: token,
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: authUser,
      });
    }
    if (path === "/auth/v1/user") return send(authUser);
    if (path === "/auth/v1/logout") return send({});
    const name = path.split("/").at(-1)!;
    calls.push(name);
    if (name === "foundation_bootstrap")
      return send({
        profile: { ...profile, roles: [role] },
        categories: fixture.categories,
        departments: fixture.departments,
        profiles: fixture.users,
      });
    if (name === "search_assets") return send([row]);
    if (name === "asset_detail")
      return send({ asset: row, attachments: [], history: [] });
    if (name === "set_publication") {
      row = {
        ...row,
        state: request.postDataJSON().p_publish ? "Available" : "In Use",
        version: row.version + 1,
      };
      return send(row);
    }
    if (name === "save_asset")
      return send(
        {
          code: "P0001",
          message:
            "Validation: keep your entered data; sample server rejection",
        },
        400,
      );
    if (path.includes("/functions/"))
      return send(
        {
          error: {
            code: "AIUnavailable",
            message: "AI is unavailable. Continue manually.",
          },
        },
        503,
      );
    return send({ message: "Unexpected test service request" }, 500);
  });
  return calls;
}
async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in to continue" }).click();
  await page.getByLabel("Email address").fill(profile.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-test-password");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
}
test("configured UI: sign in and publish/withdraw", async ({ page }) => {
  const calls = await mockedProject(page);
  await login(page);
  await page.getByRole("button", { name: `View ${initial.name}` }).click();
  await page.getByRole("button", { name: "Withdraw listing" }).click();
  await expect(
    page.getByRole("button", { name: "Publish surplus" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish surplus" }).click();
  await expect(
    page.getByRole("button", { name: "Withdraw listing" }),
  ).toBeVisible();
  expect(calls.filter((c) => c === "set_publication")).toHaveLength(2);
});
test("server form failure preserves entered data and editable specifications", async ({
  page,
}) => {
  await mockedProject(page);
  await login(page);
  await page.getByRole("button", { name: /Register/ }).click();
  await page
    .getByLabel("Asset name *", { exact: true })
    .fill("New synthetic display");
  await page
    .getByRole("dialog")
    .getByRole("combobox")
    .first()
    .selectOption(initial.categoryId);
  await page
    .getByLabel("Assigned location *", { exact: true })
    .fill("Engineering / Lab 2");
  await page.getByRole("button", { name: "Save asset record" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "sample server rejection",
  );
  await expect(page.getByLabel("Asset name *", { exact: true })).toHaveValue(
    "New synthetic display",
  );
  await expect(
    page.getByLabel("Assigned location *", { exact: true }),
  ).toHaveValue("Engineering / Lab 2");
});
test("requester UI does not expose registration or account administration", async ({
  page,
}) => {
  await mockedProject(page, "requester");
  await login(page);
  await expect(
    page.getByRole("button", { name: `View ${initial.name}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Register a resource/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: `View ${initial.name}` }).click();
  await expect(page.getByRole("button", { name: "Edit record" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Suggest classification" }),
  ).toHaveCount(0);
});
test("mobile catalogue has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockedProject(page);
  await login(page);
  await expect(
    page.getByRole("button", { name: `View ${initial.name}` }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/catalogue-mobile.png",
    fullPage: true,
  });
});

test("technical administrator sees account management without implicit catalogue authority", async ({
  page,
}) => {
  await mockedProject(page, "system_administrator");
  await login(page);
  await expect(
    page.getByRole("tab", { name: "Accounts & roles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Register a resource/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("checkbox")).toHaveCount(10);
});
