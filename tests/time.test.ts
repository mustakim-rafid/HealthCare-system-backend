import { describe, expect, it } from "vitest";
import { formatInAppTz, tzOffsetMinutes, zonedTimeToUtc } from "../src/helper/time";

describe("app timezone (Asia/Dhaka)", () => {
  it("stores an admin's 3 PM Bangladesh time as 09:00 UTC", () => {
    expect(zonedTimeToUtc(2026, 12, 1, 15 * 60, "Asia/Dhaka").toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });
  it("handles a slot right after local midnight (previous UTC day)", () => {
    expect(zonedTimeToUtc(2026, 12, 1, 30, "Asia/Dhaka").toISOString()).toBe("2026-11-30T18:30:00.000Z");
  });
  it("reports the Dhaka offset", () => {
    expect(tzOffsetMinutes(new Date("2026-12-01T00:00:00Z"), "Asia/Dhaka")).toBe(360);
  });
  it("formats stored UTC back to Bangladesh wall time", () => {
    expect(formatInAppTz(new Date("2026-12-01T09:00:00Z"))).toContain("3:00 PM");
  });
  it("handles DST zones", () => {
    expect(zonedTimeToUtc(2026, 7, 1, 15 * 60, "America/New_York").toISOString()).toBe("2026-07-01T19:00:00.000Z");
  });
});
