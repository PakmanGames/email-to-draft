import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("RFQ to Draft Quote");
  await expect(page.getByRole("heading", { name: "Paste an RFQ email" })).toBeVisible();
});
