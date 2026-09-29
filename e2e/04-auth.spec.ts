import { expect, test } from "@playwright/test";
import { API, PASSWORD, login, userId } from "./helpers";
import { sign } from "../scripts/e2e-keys.mjs";

const MAIL = "http://127.0.0.1:8025/api/v1";
const NEW_PASSWORD = "Another-Passw0rd!2026";

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  // leave the shared cast with its original password
  const service = sign("service_role");
  await request.put(`${API}/auth/v1/admin/users/${userId("e2")}`, {
    headers: { apikey: service, authorization: `Bearer ${service}` },
    data: { password: PASSWORD },
  });
});

test("an invalid or missing reset link explains itself", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Link expired" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});

test("password reset works end to end from the emailed link", async ({ page, request }) => {
  await request.delete(`${MAIL}/messages`);

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await page.getByLabel("Work email").fill("e2@va.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for that address")).toBeVisible();

  // An unknown address gets the same answer (no account enumeration)
  await page.goto("/forgot-password");
  await page.getByLabel("Work email").fill("nobody@va.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for that address")).toBeVisible();

  let link = "";
  await expect
    .poll(async () => {
      const list = (await (await request.get(`${MAIL}/search?query=to:e2@va.test`)).json()) as {
        messages: { ID: string }[];
      };
      if (!list.messages?.length) return "";
      const msg = (await (await request.get(`${MAIL}/message/${list.messages[0].ID}`)).json()) as {
        HTML: string;
        Text: string;
      };
      const m = /(http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^"\s<]+)/.exec(
        `${msg.HTML} ${msg.Text}`,
      );
      link = m ? m[1].replaceAll("&amp;", "&") : "";
      return link;
    })
    .toContain("/auth/v1/verify");
  const nobody = (await (await request.get(`${MAIL}/search?query=to:nobody@va.test`)).json()) as {
    messages_count: number;
  };
  expect(nobody.messages_count).toBe(0);

  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password/);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill("short");
  await expect(page.getByText("Use at least 10 characters.").last()).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new password").fill("different");
  await expect(page.getByText("The passwords do not match.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save password" })).toBeDisabled();
  await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save password" }).click();

  await expect(page.getByRole("heading", { name: "My dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, "e2", PASSWORD);
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await login(page, "e2", NEW_PASSWORD);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("sessions persist across reloads and sign-out ends them", async ({ page }) => {
  await login(page, "e1");
  await expect(page.getByRole("heading", { name: "My dashboard" })).toBeVisible();
  await page.goto("/commitments");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Personal Improvement Commitment Charter" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/commitments");
  await expect(page).toHaveURL(/\/login$/);
});

test("deep links survive sign-in and unknown routes show a helpful page", async ({ page }) => {
  await page.goto("/trends");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Work email").fill("e1@va.test");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "My trends" })).toBeVisible();
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
