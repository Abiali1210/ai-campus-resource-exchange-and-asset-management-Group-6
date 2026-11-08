import { test, expect } from "@playwright/test";
// The preview server is started by this test itself with no credentials. It is
// separate from the configured/mocked service server in playwright.config.ts.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
let preview: ReturnType<typeof spawn>;
test.beforeAll(async () => {
  preview = spawn(
    process.execPath,
    [
      resolve("node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5175",
      "--strictPort",
    ],
    {
      env: {
        ...process.env,
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://127.0.0.1:5175")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Preview did not start");
});
test.afterAll(() => preview?.kill());
test("synthetic preview supports filtering and details without simulated authentication", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5175");
  await expect(
    page.getByText("Read-only preview", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View Dell 24-inch display" }),
  ).toBeVisible();
  await page
    .getByPlaceholder("Try ‘monitor’, ‘chairs’ or ‘projector’")
    .fill("nonsense-no-match");
  await expect(
    page.getByText("No resources match these filters."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await page.getByLabel("Condition", { exact: true }).selectOption("Unknown");
  await expect(
    page.getByRole("button", {
      name: "View Projector awaiting condition assessment",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View Dell 24-inch display" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "View Projector awaiting condition assessment",
    })
    .click();
  await expect(page.getByText("Unknown · assess before use")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit record" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: "test-results/catalogue-preview-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
