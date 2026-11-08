import { test, expect } from "@playwright/test";

test("protected page redirects to login when signed out", async ({ page }) => {
  await page.goto("home");
  await expect(page).toHaveURL(/\/login\?next=%2Fhome$/);
});

test("wrong credentials show an error and stay on login", async ({ page }) => {
  // A fictitious account, so failed attempts never lock a seeded one.
  await page.goto("login");
  await page.locator("#email").fill("e2e-wrong@test.invalid");
  await page.locator("#password").fill("WrongPassword123!");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
