import { execFileSync } from "node:child_process";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { DIMENSION_WORKFLOWS } from "../src/framework";

export const PASSWORD = "Passw0rd!Passw0rd";
export const API = "http://127.0.0.1:54321";
export type Who = "admin" | "ceo" | "mgr" | "e1" | "e2" | "outsider";

export async function login(page: Page, who: Who, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(`${who}@va.test`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function loginAndWait(page: Page, who: Exclude<Who, "outsider">) {
  await login(page, who);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

/** A fresh, signed-in page in its own browser context (its own session). */
export async function session(browser: Browser, who: Exclude<Who, "outsider">): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAndWait(page, who);
  return page;
}

/** Run SQL as the database owner (test fixtures and assertions the UI cannot make). */
export function sql(query: string): string {
  const pg = process.env.E2E_PG ?? "postgresql://postgres:postgres@127.0.0.1:54329/postgres";
  return execFileSync("psql", [pg, "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-c", query], {
    encoding: "utf8",
  }).trim();
}

export function userId(who: Who): string {
  return sql(`select id from auth.users where email = '${who}@va.test'`);
}

export async function rateDimension(page: Page, name: string, score: number) {
  const group = page.getByRole("group", {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (rating|self-rating)$`),
  });
  await group
    .locator("label")
    .filter({ hasText: `${score} out of 5` })
    .click();
}

export function dimensionCard(page: Page, name: string): Locator {
  return page.locator("section", { has: page.getByRole("heading", { name, exact: true }) });
}

export async function completeBaseline(page: Page, scoreFor: (index: number) => number) {
  await page.goto("/baseline");
  for (const [i, d] of DIMENSION_WORKFLOWS.entries())
    await rateDimension(page, d.name, scoreFor(i));
  await page.getByRole("button", { name: "Submit baseline" }).click();
  await expect(page.getByText("Baseline saved.")).toBeVisible();
}

export async function completeWeekly(page: Page, scoreFor: (index: number) => number) {
  await page.goto("/weekly");
  await expect(page.getByRole("heading", { name: "Weekly scorecard" })).toBeVisible();
  for (const [i, d] of DIMENSION_WORKFLOWS.entries()) {
    await rateDimension(page, d.name, scoreFor(i));
    const card = dimensionCard(page, d.name);
    for (const metric of d.scorecardMetrics)
      await card.getByLabel(metric, { exact: true }).fill("2");
    await card.getByLabel("Evidence, variance or reflection").fill(`Evidence for ${d.name}`);
  }
  await page.getByRole("button", { name: /(Submit|Update) weekly position/ }).click();
  await expect(page.getByText("Your weekly position has been submitted.")).toBeVisible();
}

export async function accessToken(page: Page): Promise<string> {
  const raw = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"));
    return key ? localStorage.getItem(key) : null;
  });
  if (!raw) throw new Error("no session in localStorage");
  return (JSON.parse(raw) as { access_token: string }).access_token;
}
