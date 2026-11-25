import { AppointmentStatus, Role } from "@prisma/client";

/**
 * Booking lifecycle (single source of truth for valid transitions).
 *
 *   PENDING_PAYMENT ──pay──▶ CONFIRMED ──▶ INPROGRESS ──▶ COMPLETED
 *        │                     │  ▲             │
 *        │ timeout/cancel      │  │ accept      └──▶ NO_SHOW
 *        ▼                     ▼  │
 *    CANCELLED ◀──────────── POSTPONED
 *
 * SCHEDULED is the legacy status used by bookings created before this lifecycle
 * existed; it behaves like an unpaid booking that can still be paid or cancelled.
 */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  SCHEDULED: ["CONFIRMED", "INPROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["POSTPONED", "INPROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"],
  POSTPONED: ["CONFIRMED", "CANCELLED"],
  INPROGRESS: ["COMPLETED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Statuses that occupy a doctor slot / a patient's time. */
export const ACTIVE_STATUSES: AppointmentStatus[] = [
  "PENDING_PAYMENT",
  "SCHEDULED",
  "CONFIRMED",
  "POSTPONED",
  "INPROGRESS",
];

/** Statuses a role may set through the generic "update status" endpoint. */
export const MANUAL_STATUS_BY_ROLE: Partial<Record<Role, AppointmentStatus[]>> = {
  DOCTOR: ["INPROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED"],
  ADMIN: ["CONFIRMED", "INPROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED"],
};

export const canTransition = (from: AppointmentStatus, to: AppointmentStatus) =>
  STATUS_TRANSITIONS[from]?.includes(to) ?? false;

/** Accepts the legacy "CANCELED" spelling used by the old frontend. */
export const normalizeStatus = (status: string): AppointmentStatus | null => {
  const upper = String(status || "").trim().toUpperCase();
  const value = upper === "CANCELED" ? "CANCELLED" : upper;
  return (Object.keys(STATUS_TRANSITIONS) as AppointmentStatus[]).includes(value as AppointmentStatus)
    ? (value as AppointmentStatus)
    : null;
};

/** https://meet.google.com/abc-defg-hij (optionally with query string, e.g. ?authuser=0) */
export const MEET_LINK_REGEX = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?[\w=&%.-]*)?$/;
export const isValidMeetLink = (link: string) => MEET_LINK_REGEX.test(String(link).trim());

/** Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd) */
export const rangesOverlap = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();

/** Returns pairs of indexes that overlap inside one list of ranges. */
export const findOverlaps = (ranges: { start: Date; end: Date }[]) => {
  const sorted = ranges.map((r, i) => ({ ...r, i })).sort((a, b) => a.start.getTime() - b.start.getTime());
  const pairs: [number, number][] = [];
  for (let k = 1; k < sorted.length; k++) {
    if (rangesOverlap(sorted[k - 1].start, sorted[k - 1].end, sorted[k].start, sorted[k].end)) {
      pairs.push([sorted[k - 1].i, sorted[k].i]);
    }
  }
  return pairs;
};

/** Patient cancellation policy: free cancellation (with refund) until `cutoffHours` before start. */
export const isBeforeCancellationCutoff = (start: Date, cutoffHours: number, now = new Date()) =>
  start.getTime() - now.getTime() >= cutoffHours * 60 * 60 * 1000;

/** Escape user text before using it anywhere a pattern could be interpreted. */
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Trim, collapse whitespace, strip control chars and cap length for free-text search input. */
export const sanitizeSearchTerm = (value: unknown, max = 64) =>
  String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
