import { test, expect } from "@playwright/test";
import { storageStatePath } from "./accounts";

test.describe("as Admin Lab", () => {
  test.use({ storageState: storageStatePath("admin") });

  test("home shows the launcher greeting", async ({ page }) => {
    await page.goto("home");
    await expect(page.getByRole("heading", { level: 1, name: /^Halo, / })).toBeVisible();
  });

  test("sample database opens", async ({ page }) => {
    await page.goto("lab/database");
    await expect(page.getByRole("heading", { level: 1, name: "Database Sampel" })).toBeVisible();
  });
});

test.describe("as Database staff", () => {
  test.use({ storageState: storageStatePath("database") });

  test("generate samples opens", async ({ page }) => {
    await page.goto("lab/samples/generate");
    await expect(page).toHaveURL(/\/lab\/samples\/generate$/);
    await expect(page.getByRole("heading", { level: 1, name: "Buat & Cetak Label" })).toBeVisible();
  });
});
