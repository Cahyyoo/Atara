import { test as setup, expect } from "@playwright/test";
import { ACCOUNTS, storageStatePath, type Role } from "./accounts";

for (const role of Object.keys(ACCOUNTS) as Role[]) {
  setup(`login as ${role}`, async ({ page }) => {
    const { email, password } = ACCOUNTS[role];
    await page.goto("login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL("**/home");

    // First visit shows the welcome dialog; closing it marks the guide as seen.
    const welcome = page.getByRole("dialog");
    const shown = await welcome.waitFor({ state: "visible", timeout: 3000 }).then(
      () => true,
      () => false
    );
    if (shown) {
      await page.keyboard.press("Escape");
      await expect(welcome).toBeHidden();
    }

    await page.context().storageState({ path: storageStatePath(role) });
  });
}
