import { expect, test } from "@playwright/test";
import { login, loginAndWait } from "./helpers";

test("signed-out visitors are sent to the sign-in page", async ({ page }) => {
  await page.goto("/commitments");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Performance workspace" })).toBeVisible();
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill("e1@va.test");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("The email or password is incorrect.");
});

test("employee signs in and sees the employee dashboard", async ({ page }) => {
  await loginAndWait(page, "e1");
  await expect(page.getByRole("heading", { name: "My dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cockpit" })).toHaveCount(0);
});

test("a user without membership sees the awaiting-access screen", async ({ page }) => {
  await login(page, "outsider");
  await expect(page.getByRole("heading", { name: "Your account is not active yet" })).toBeVisible();
});
