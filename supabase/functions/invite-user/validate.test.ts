import { describe, expect, it } from "vitest";
import { mayGrant, parseInvite, redirectFor } from "./validate";

const ok = {
  email: " Ann@Example.com ",
  full_name: " Ann Lee ",
  role: "employee",
  manager_user_id: "aaaaaaaa-0000-4000-8000-000000000001",
};

describe("parseInvite", () => {
  it("normalises a valid request", () => {
    expect(parseInvite(ok)).toEqual({
      ok: true,
      value: {
        email: "ann@example.com",
        fullName: "Ann Lee",
        role: "employee",
        managerId: "aaaaaaaa-0000-4000-8000-000000000001",
      },
    });
  });
  it("treats a missing manager as none", () => {
    const r = parseInvite({ ...ok, manager_user_id: "" });
    expect(r.ok && r.value.managerId).toBeNull();
  });
  it.each([
    [null, /JSON body/],
    ["x", /JSON body/],
    [{ ...ok, email: "nope" }, /valid email/],
    [{ ...ok, email: "a@b" }, /valid email/],
    [{ ...ok, full_name: "  " }, /full name/],
    [{ ...ok, full_name: "x".repeat(121) }, /full name/],
    [{ ...ok, role: "root" }, /valid role/],
    [{ ...ok, role: 5 }, /valid role/],
    [{ ...ok, manager_user_id: "not-a-uuid" }, /manager/],
  ])("rejects %j", (body, message) => {
    const r = parseInvite(body);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(message);
  });
});

describe("redirectFor", () => {
  const allowed = ["https://visionactiv.aurisnexus.co.za"];
  it("only redirects back to allowed origins", () => {
    expect(redirectFor("https://visionactiv.aurisnexus.co.za", allowed)).toBe(
      "https://visionactiv.aurisnexus.co.za/reset-password",
    );
    expect(redirectFor("https://evil.example", allowed)).toBeNull();
    expect(redirectFor(null, allowed)).toBeNull();
  });
});

describe("mayGrant", () => {
  it("administrators grant anything", () => {
    expect(mayGrant("admin", "admin")).toBe(true);
    expect(mayGrant("admin", "ceo")).toBe(true);
  });
  it("the CEO grants only employee and manager", () => {
    expect(mayGrant("ceo", "manager")).toBe(true);
    expect(mayGrant("ceo", "employee")).toBe(true);
    expect(mayGrant("ceo", "admin")).toBe(false);
    expect(mayGrant("ceo", "ceo")).toBe(false);
  });
  it("nobody else grants anything", () => {
    expect(mayGrant("manager", "employee")).toBe(false);
    expect(mayGrant("employee", "employee")).toBe(false);
  });
});
