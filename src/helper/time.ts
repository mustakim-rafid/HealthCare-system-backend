import config from "../config";

/**
 * All instants are stored in UTC. Wall-clock times entered by people (admin slot creation)
 * and times written into notifications/emails use the app timezone (APP_TIMEZONE, default Asia/Dhaka).
 */

/** Offset of `timeZone` from UTC in minutes at the given instant (e.g. Asia/Dhaka → +360). */
export const tzOffsetMinutes = (instant: Date, timeZone = config.app_timezone): number => {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT+06:00" or "GMT"
  const m = name?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minutes : minutes;
};

/** Converts a wall-clock time (y, m 1-12, d, minutes since midnight) in `timeZone` to a UTC Date. */
export const zonedTimeToUtc = (y: number, m: number, d: number, minutesOfDay: number, timeZone = config.app_timezone) => {
  const asIfUtc = Date.UTC(y, m - 1, d, 0, minutesOfDay);
  // Two passes handle DST transitions correctly
  let utc = asIfUtc - tzOffsetMinutes(new Date(asIfUtc), timeZone) * 60_000;
  utc = asIfUtc - tzOffsetMinutes(new Date(utc), timeZone) * 60_000;
  return new Date(utc);
};

/** Human readable date-time in the app timezone, e.g. "Dec 1, 2026, 3:00 PM (GMT+6)". */
export const formatInAppTz = (instant: Date, opts: { timeOnly?: boolean } = {}) => {
  const tz = config.app_timezone;
  const main = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    ...(opts.timeOnly ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" }),
  }).format(instant);
  const short = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value;
  return short ? `${main} (${short})` : main;
};
