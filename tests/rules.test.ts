import { describe, expect, it } from "vitest";
import {
  canTransition,
  findOverlaps,
  isBeforeCancellationCutoff,
  isValidMeetLink,
  MANUAL_STATUS_BY_ROLE,
  normalizeStatus,
  sanitizeSearchTerm,
} from "../src/module/appointment/appointment.rules";

const d = (iso: string) => new Date(iso);

describe("booking status transitions", () => {
  it("allows the happy path", () => {
    expect(canTransition("PENDING_PAYMENT", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "INPROGRESS")).toBe(true);
    expect(canTransition("INPROGRESS", "COMPLETED")).toBe(true);
    expect(canTransition("CONFIRMED", "POSTPONED")).toBe(true);
    expect(canTransition("POSTPONED", "CONFIRMED")).toBe(true);
  });
  it("rejects invalid transitions", () => {
    expect(canTransition("PENDING_PAYMENT", "COMPLETED")).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransition("NO_SHOW", "COMPLETED")).toBe(false);
    expect(canTransition("POSTPONED", "COMPLETED")).toBe(false);
  });
  it("normalizes the legacy CANCELED spelling and rejects junk", () => {
    expect(normalizeStatus("canceled")).toBe("CANCELLED");
    expect(normalizeStatus("confirmed")).toBe("CONFIRMED");
    expect(normalizeStatus("{$ne:1}")).toBeNull();
  });
  it("restricts which statuses each role may set manually", () => {
    expect(MANUAL_STATUS_BY_ROLE.DOCTOR).not.toContain("CONFIRMED");
    expect(MANUAL_STATUS_BY_ROLE.PATIENT).toBeUndefined();
  });
});

describe("meet link validation", () => {
  it("accepts real Google Meet links", () => {
    expect(isValidMeetLink("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isValidMeetLink("https://meet.google.com/abc-defg-hij?authuser=0")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isValidMeetLink("http://meet.google.com/abc-defg-hij")).toBe(false);
    expect(isValidMeetLink("https://meet.google.com.evil.com/abc-defg-hij")).toBe(false);
    expect(isValidMeetLink("https://zoom.us/j/123")).toBe(false);
    expect(isValidMeetLink("javascript:alert(1)")).toBe(false);
  });
});

describe("overlap detection", () => {
  it("finds overlapping slots and ignores back-to-back ones", () => {
    const ranges = [
      { start: d("2030-01-01T10:00Z"), end: d("2030-01-01T10:30Z") },
      { start: d("2030-01-01T10:30Z"), end: d("2030-01-01T11:00Z") },
      { start: d("2030-01-01T10:15Z"), end: d("2030-01-01T10:45Z") },
    ];
    const pairs = findOverlaps(ranges);
    expect(pairs.length).toBeGreaterThan(0);
    expect(findOverlaps(ranges.slice(0, 2))).toEqual([]);
  });
});

describe("cancellation cutoff", () => {
  const now = d("2030-01-01T00:00Z");
  it("allows cancellation before the cutoff", () => {
    expect(isBeforeCancellationCutoff(d("2030-01-02T01:00Z"), 24, now)).toBe(true);
  });
  it("blocks cancellation inside the cutoff", () => {
    expect(isBeforeCancellationCutoff(d("2030-01-01T23:00Z"), 24, now)).toBe(false);
  });
});

describe("search input sanitising", () => {
  it("trims, collapses whitespace, strips control chars and caps length", () => {
    expect(sanitizeSearchTerm("  dr \n\t smith\u0000 ")).toBe("dr smith");
    expect(sanitizeSearchTerm("x".repeat(500)).length).toBe(64);
    expect(sanitizeSearchTerm(undefined)).toBe("");
  });
});
