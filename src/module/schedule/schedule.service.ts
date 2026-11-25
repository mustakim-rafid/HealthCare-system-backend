import httpStatus from "http-status";
import { Prisma, Role, Schedule } from "@prisma/client";
import { IScheduleFilterQueries, ISchedulePayload } from "../schedule/schedule.interface";
import { prisma } from "../../utils/prisma";
import { IPaginationParameters, normalizeQueryParams } from "../../helper/normalizeQueryParams";
import { TUserJwtPayload } from "../../types";
import { AppError } from "../../utils/AppError";
import { audit } from "../../helper/audit";

const SLOT_MINUTES = 30;
const MAX_DAYS = 62;

/**
 * Admin creates 30-minute slots for every day in [startDate, endDate] between startTime and endTime.
 * Times are interpreted as UTC (the client converts the admin's local time to UTC before sending
 * when `timezoneOffsetMinutes` is provided). Existing identical slots are skipped (idempotent) and
 * past slots are never created.
 */
const createSchedule = async (payload: ISchedulePayload & { timezoneOffsetMinutes?: number }, user?: TUserJwtPayload) => {
  const { startDate, endDate, startTime, endTime } = payload;
  const offset = Number(payload.timezoneOffsetMinutes ?? 0) * 60 * 1000; // Date.getTimezoneOffset() style
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if (eh * 60 + em <= sh * 60 + sm) throw new AppError(httpStatus.BAD_REQUEST, "End time must be after start time");

  const toUtcDay = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const dayStart = toUtcDay(startDate);
  const dayEnd = toUtcDay(endDate);
  if (Number.isNaN(dayStart) || Number.isNaN(dayEnd)) throw new AppError(httpStatus.BAD_REQUEST, "Invalid date");
  if (dayEnd < dayStart) throw new AppError(httpStatus.BAD_REQUEST, "End date must be on or after the start date");
  if ((dayEnd - dayStart) / 86_400_000 > MAX_DAYS) throw new AppError(httpStatus.BAD_REQUEST, `You can create at most ${MAX_DAYS} days at once`);

  const now = Date.now();
  const candidates: { startDateTime: Date; endDateTime: Date }[] = [];
  for (let day = dayStart; day <= dayEnd; day += 86_400_000) {
    for (let m = sh * 60 + sm; m + SLOT_MINUTES <= eh * 60 + em; m += SLOT_MINUTES) {
      const start = new Date(day + m * 60_000 + offset);
      if (start.getTime() <= now) continue;
      candidates.push({ startDateTime: start, endDateTime: new Date(start.getTime() + SLOT_MINUTES * 60_000) });
    }
  }
  if (!candidates.length) throw new AppError(httpStatus.BAD_REQUEST, "No future slots fall inside that range");

  const existing = await prisma.schedule.findMany({
    where: { startDateTime: { in: candidates.map((c) => c.startDateTime) }, isDeleted: false },
    select: { startDateTime: true, endDateTime: true },
  });
  const key = (s: { startDateTime: Date; endDateTime: Date }) => `${s.startDateTime.getTime()}-${s.endDateTime.getTime()}`;
  const existingKeys = new Set(existing.map(key));
  const toCreate = candidates.filter((c) => !existingKeys.has(key(c)));

  const created = await prisma.$transaction(toCreate.map((data) => prisma.schedule.create({ data })));
  await audit({ actor: user, action: "SCHEDULE_CREATED", entity: "Schedule", metadata: { count: created.length, startDate, endDate, startTime, endTime } });
  return created;
};

/**
 * Admin: all (non-deleted) slots. Doctor: future slots they have NOT selected yet (to pick from).
 */
const getAllAvailableSchedules = async (
  paginations: Partial<IPaginationParameters>,
  filters: Partial<IScheduleFilterQueries>,
  user: TUserJwtPayload
) => {
  const { take, skip, page, sortOrder, sortBy } = normalizeQueryParams(paginations);
  const and: Prisma.ScheduleWhereInput[] = [{ isDeleted: false }];

  if (user.role === Role.DOCTOR) {
    const mine = await prisma.doctorSchedule.findMany({ where: { doctor: { email: user.email } }, select: { scheduleId: true } });
    and.push({ id: { notIn: mine.map((m) => m.scheduleId) } });
    and.push({ startDateTime: { gt: new Date() } });
  }
  if (filters.startDateTime) and.push({ startDateTime: { gte: new Date(filters.startDateTime) } });
  if (filters.endDateTime) and.push({ endDateTime: { lte: new Date(filters.endDateTime) } });

  const orderField = ["startDateTime", "endDateTime", "createdAt"].includes(sortBy) ? sortBy : "startDateTime";
  const where: Prisma.ScheduleWhereInput = { AND: and };
  const [data, total] = await Promise.all([
    prisma.schedule.findMany({
      take,
      skip,
      orderBy: { [orderField]: sortBy === orderField ? sortOrder : "asc" },
      where,
      include: user.role === Role.ADMIN ? { _count: { select: { doctorSchedule: true, appointment: true } } } : undefined,
    }),
    prisma.schedule.count({ where }),
  ]);
  return { meta: { limit: take, page, total }, data };
};

/** Soft delete. Refused while any active booking uses the slot; unbooked doctor offers are removed. */
const deleteScheduleById = async (id: string, user?: TUserJwtPayload) => {
  const schedule = await prisma.schedule.findFirst({ where: { id, isDeleted: false } });
  if (!schedule) throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
  const active = await prisma.appointment.count({
    where: { scheduleId: id, status: { in: ["PENDING_PAYMENT", "SCHEDULED", "CONFIRMED", "POSTPONED", "INPROGRESS"] } },
  });
  if (active) throw new AppError(httpStatus.CONFLICT, "This slot has active bookings and cannot be deleted");
  return prisma.$transaction(async (tx) => {
    await tx.doctorSchedule.deleteMany({ where: { scheduleId: id, isBooked: false } });
    const updated = await tx.schedule.update({ where: { id }, data: { isDeleted: true } });
    await audit({ actor: user, action: "SCHEDULE_DELETED", entity: "Schedule", entityId: id }, tx);
    return updated;
  });
};

const getByIdFromDB = async (id: string): Promise<Schedule | null> => {
  return prisma.schedule.findFirst({ where: { id, isDeleted: false } });
};

export const scheduleService = { createSchedule, getAllAvailableSchedules, deleteScheduleById, getByIdFromDB };
