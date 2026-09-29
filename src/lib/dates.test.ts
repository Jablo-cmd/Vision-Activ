import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, formatDate, isIsoDate, orgToday, weekStart } from "./dates";

describe("orgToday", () => {
  it("uses South African time, not UTC", () => {
    // 22:30 UTC on the 28th is 00:30 on the 29th in Johannesburg (UTC+2)
    expect(orgToday(new Date("2026-09-28T22:30:00Z"))).toBe("2026-09-29");
    expect(orgToday(new Date("2026-09-28T21:59:00Z"))).toBe("2026-09-28");
  });
});

describe("weekStart", () => {
  it("returns the Monday of the ISO week", () => {
    expect(weekStart("2026-09-28")).toBe("2026-09-28"); // Monday
    expect(weekStart("2026-09-29")).toBe("2026-09-28");
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Sunday belongs to the previous Monday
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
  });
  it("crosses month and year boundaries", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
    expect(weekStart("2024-03-01")).toBe("2024-02-26"); // leap year
  });
});

describe("date arithmetic", () => {
  it("adds days across boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 2)).toBe("2024-03-01");
    expect(addDays("2026-09-28", -7)).toBe("2026-09-21");
  });
  it("adds months from the first of the month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-01");
  });
  it("computes whole-day differences", () => {
    expect(diffDays("2026-10-05", "2026-09-28")).toBe(7);
    expect(diffDays("2026-09-28", "2026-10-05")).toBe(-7);
  });
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("29/09/2026")).toBe(false);
  });
  it("formats", () => {
    expect(formatDate("2026-09-29")).toBe("29 Sep 2026");
    expect(formatDate(null)).toBe("—");
  });
});
