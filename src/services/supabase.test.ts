import { describe, expect, it } from "vitest";
import { AppError, errorText, friendlyMessage } from "./supabase";

describe("friendlyMessage", () => {
  it("passes through messages our own functions raise for people", () => {
    expect(
      friendlyMessage({ code: "55000", message: "Verification requires accepted evidence" }),
    ).toBe("Verification requires accepted evidence");
    expect(
      friendlyMessage({ code: "42501", message: "Only an administrator can manage members" }),
    ).toBe("Only an administrator can manage members");
  });
  it("translates generic database failures", () => {
    expect(
      friendlyMessage({
        code: "42501",
        message: 'new row violates row-level security policy for table "x"',
      }),
    ).toBe("You do not have permission to do that.");
    expect(
      friendlyMessage({ code: "23505", message: "duplicate key value violates unique constraint" }),
    ).toBe("That already exists.");
    expect(friendlyMessage({ code: "23514", message: 'violates check constraint "c"' })).toBe(
      "Those values are not allowed. Please review the form.",
    );
  });
  it("never reveals SQL or schema details", () => {
    for (const e of [
      { code: "42703", message: 'column "secret_col" does not exist' },
      { code: "42P01", message: 'relation "public.audit_log" does not exist' },
      { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
      { code: "23503", message: 'insert violates foreign key constraint "fk_x" on table "y"' },
    ])
      expect(friendlyMessage(e)).not.toMatch(/secret_col|audit_log|PGRST|fk_x|relation|column/);
  });
  it("explains expired sessions and offline states", () => {
    expect(friendlyMessage({ code: "PGRST301", message: "JWT expired" })).toMatch(
      /session has expired/,
    );
    expect(friendlyMessage({ message: "JWT expired" })).toMatch(/session has expired/);
    expect(friendlyMessage({ message: "Failed to fetch" })).toMatch(/could not reach the server/);
  });
});

describe("errorText", () => {
  it("shows AppError messages, maps other errors and ignores non-errors", () => {
    expect(errorText(new AppError("Custom"))).toBe("Custom");
    expect(errorText(new TypeError("Failed to fetch"))).toMatch(/could not reach the server/);
    expect(
      errorText(new Error("TypeError: x is undefined at Object.<anonymous> (file.js:1)")),
    ).toBe("Something went wrong. Please try again.");
    expect(errorText("boom")).toBe("Something went wrong. Please try again.");
  });
});
