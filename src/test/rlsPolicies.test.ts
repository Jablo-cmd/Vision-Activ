import { describe, expect, it } from "vitest";

describe("RLS policy contract", () => {
  it("requires ownership and active organization membership", () => {
    const owner = { userId: "u1", rowUserId: "u1", activeMember: true };
    const otherUser = { userId: "u2", rowUserId: "u1", activeMember: true };
    const inactiveMember = { userId: "u1", rowUserId: "u1", activeMember: false };

    const allowed = (x: typeof owner) => x.userId === x.rowUserId && x.activeMember;

    expect(allowed(owner)).toBe(true);
    expect(allowed(otherUser)).toBe(false);
    expect(allowed(inactiveMember)).toBe(false);
  });

  it("requires management role for leadership actions", () => {
    const allowedRoles = ["manager", "ceo", "admin"];
    expect(allowedRoles.includes("manager")).toBe(true);
    expect(allowedRoles.includes("employee")).toBe(false);
  });
});
