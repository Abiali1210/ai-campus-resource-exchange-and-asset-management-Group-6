import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
async function mockedProject(
  page: Page,
  role = "representative",
  overrides: Partial<AssetView> = {},
  otherRows: AssetView[] = [],
) {
  let row = { ...initial, ...overrides };
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
    if (name === "search_assets") return send([row, ...otherRows]);
    if (name === "asset_detail") {
      const requested = request.postDataJSON().p_portion_id;
      return send({
        asset:
          [row, ...otherRows].find((a) => a.portionId === requested) ?? row,
        attachments: [],
        history: [],
      });
    }
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
test("catalogue illustrations match item names and stay consistent in asset records", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const samples = [
    ["CO2 fire extinguisher", "Safety equipment", "Fire extinguisher"],
    ["Dell Latitude laptop", "Computers", "Laptop"],
    ["HP laser printer", "Office equipment", "Printer"],
    ["Teaching lab chair", "Furniture", "Chair"],
    ["Epson projector", "AV equipment", "Projector"],
    ["Oak study desk", "Furniture", "Desk or table"],
    ["Filing cabinet", "Office furniture", "Storage cabinet"],
    ["Library bookshelf", "Furniture", "Bookshelf"],
    ["Engineering textbooks", "Library", "Book"],
    ["Optical microscope", "Lab equipment", "Microscope"],
    ["Maintenance tool kit", "Facilities", "Toolbox"],
    ["Mobile whiteboard", "Teaching equipment", "Whiteboard"],
    ["USB keyboard", "Peripherals", "Keyboard"],
    ["Wireless mouse", "Peripherals", "Computer mouse"],
    ["Desktop computer", "Computers", "Desktop computer"],
    ["Delivery trolley", "Facilities", "Trolley"],
    ["Research apparatus", "Lab equipment", "Resource box"],
  ];
  const rows = samples.map(([name, categoryName]) => ({
    ...initial,
    assetId: randomUUID(),
    portionId: randomUUID(),
    name,
    categoryName,
    description: `${name} — synthetic illustration review sample, not actual campus inventory.`,
    specifications: name === "CO2 fire extinguisher" ? { agent: "CO2" } : {},
    purchaseDate: null,
    unitValue: null,
  }));
  await mockedProject(page, "representative", {}, rows);
  await login(page);
  for (const [name, , label] of samples) {
    const card = page.getByRole("button", {
      name: `View ${name}`,
      exact: true,
    });
    await expect(
      card.getByRole("img", { name: `${label} illustration`, exact: true }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: "test-results/asset-illustrations-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "View CO2 fire extinguisher", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("img", {
      name: "Fire extinguisher illustration",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/extinguisher-record-desktop.png",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/asset-illustrations-mobile.png",
    fullPage: true,
  });
});

test("asset overview fits desktop and keeps history and mobile content accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockedProject(page, "requester");
  await login(page);
  await page.getByRole("button", { name: `View ${initial.name}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Request this resource", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Technical specifications" }),
  ).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/asset-record-desktop.png" });
  const history = dialog
    .locator("summary")
    .filter({ hasText: "Asset history" });
  await history.focus();
  await page.keyboard.press("Enter");
  await expect(
    dialog.getByText("No history visible for this record."),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  await history.scrollIntoViewIfNeeded();
  await expect(history).toBeInViewport();
  await page.screenshot({ path: "test-results/asset-record-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `View ${initial.name}` }),
  ).toBeFocused();
});

test("long asset records wrap and remain scrollable without clipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await mockedProject(page, "requester", {
    description: "Extended description with full inspection notes. ".repeat(35),
    specifications: Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [
        `Specification ${i}`,
        "unbroken-value-".repeat(12),
      ]),
    ),
  });
  await login(page);
  await page.getByRole("button", { name: `View ${initial.name}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Specification 24", { exact: true }),
  ).toBeAttached();
  expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  expect(
    await dialog.evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  await dialog
    .getByText("Specification 24", { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByText("Specification 24", { exact: true }),
  ).toBeInViewport();
});

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
test("desktop account controls remain reachable with a full menu and long profile name", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await mockedProject(page);
  await login(page);
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  await expect(signOut).toBeInViewport();
  const dimensions = await page.locator(".avatar").evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height,
  }));
  expect(dimensions.width).toBe(dimensions.height);
  await signOut.click();
  await expect(
    page.getByRole("button", { name: "Sign in to continue", exact: true }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in to continue", exact: true }),
  ).toBeVisible();
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
