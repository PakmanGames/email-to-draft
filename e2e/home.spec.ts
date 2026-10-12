import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("New Quote · Email to Draft");
  await expect(page.getByRole("heading", { name: "New Quote", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Customer email" })).toBeVisible();
});

test("the sidebar reaches the drafts list and back", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.getByRole("navigation", { name: "Main" });

  await sidebar.getByRole("link", { name: /^Drafts/ }).click();
  await expect(page).toHaveURL(/\/quotes$/);
  await expect(page.getByRole("heading", { name: "Drafts", exact: true })).toBeVisible();

  await sidebar.getByRole("link", { name: "New Quote" }).click();
  await expect(page.getByRole("heading", { name: "New Quote", exact: true })).toBeVisible();
});
