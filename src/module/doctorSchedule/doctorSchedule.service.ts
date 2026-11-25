import { Prisma } from "@prisma/client";
import httpStatus from "http-status";
import { normalizeQueryParams } from "../../helper/normalizeQueryParams";
import { TUserJwtPayload } from "../../types";
import { prisma } from "../../utils/prisma";
import { AppError } from "../../utils/AppError";
import { audit } from "../../helper/audit";
import { findOverlaps } from "../appointment/appointment.rules";

const toBool = (v: unknown) => (v === "true" ? true : v === "false" ? false : undefined);

/**
 * Doctor picks admin-created slots to offer. Rejects:
 *  - unknown / deleted / past slots
 *  - slots overlapping each other in the same request
 *  - slots overlapping a slot the doctor already offers
 * Already-selected slots are skipped (idempotent).
 */
const createDoctorSchedule = async (scheduleIds: string[], user: TUserJwtPayload) => {
  const doctor = await prisma.doctor.findFirst({ where: { email: user.email, isDeleted: false } });
  if (!doctor) throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");

  const ids = [...new Set(scheduleIds)];
  const schedules = await prisma.schedule.findMany({ where: { id: { in: ids }, isDeleted: false } });
  if (schedules.length !== ids.length) throw new AppError(httpStatus.BAD_REQUEST, "One or more selected slots do not exist");
  if (schedules.some((s) => s.startDateTime <= new Date())) {
    throw new AppError(httpStatus.BAD_REQUEST, "You cannot offer slots in the past");
  }

  const existing = await prisma.doctorSchedule.findMany({
    where: { doctorId: doctor.id, schedule: { isDeleted: false, endDateTime: { gt: new Date() } } },
    include: { schedule: true },
  });
  const existingIds = new Set(existing.map((e) => e.scheduleId));
  const fresh = schedules.filter((s) => !existingIds.has(s.id));

  const internal = findOverlaps(fresh.map((s) => ({ start: s.startDateTime, end: s.endDateTime })));
  if (internal.length) throw new AppError(httpStatus.CONFLICT, "Some of the selected slots overlap each other");

  const all = [
    ...existing.map((e) => ({ start: e.schedule.startDateTime, end: e.schedule.endDateTime, isNew: false })),
    ...fresh.map((s) => ({ start: s.startDateTime, end: s.endDateTime, isNew: true })),
  ];
  const clashes = findOverlaps(all).filter(([a, b]) => all[a].isNew !== all[b].isNew);
  if (clashes.length) throw new AppError(httpStatus.CONFLICT, "Some selected slots overlap slots you already offer");

  const result = await prisma.doctorSchedule.createMany({
    data: fresh.map((s) => ({ scheduleId: s.id, doctorId: doctor.id })),
    skipDuplicates: true,
  });
  await audit({ actor: user, action: "DOCTOR_SCHEDULE_ADDED", entity: "Doctor", entityId: doctor.id, metadata: { count: result.count } });
  return { count: result.count, skipped: ids.length - result.count };
};

/** The logged-in doctor's own slots (previously this returned every doctor's slots). */
const getMySchedule = async (filters: Record<string, unknown>, options: any, user: TUserJwtPayload) => {
  const { page, skip, take } = normalizeQueryParams(options);
  const and: Prisma.DoctorScheduleWhereInput[] = [
    { doctor: { email: user.email } },
    { schedule: { isDeleted: false } },
  ];
  if (filters.startDate && filters.endDate) {
    and.push({ schedule: { startDateTime: { gte: new Date(String(filters.startDate)) }, endDateTime: { lte: new Date(String(filters.endDate)) } } });
  }
  const isBooked = toBool(filters.isBooked);
  if (isBooked !== undefined) and.push({ isBooked });
  if (filters.upcoming === "true") and.push({ schedule: { startDateTime: { gt: new Date() } } });

  const where: Prisma.DoctorScheduleWhereInput = { AND: and };
  const [data, total] = await Promise.all([
    prisma.doctorSchedule.findMany({
      where,
      skip,
      take,
      include: { schedule: true },
      orderBy: { schedule: { startDateTime: options.sortOrder === "desc" ? "desc" : "asc" } },
    }),
    prisma.doctorSchedule.count({ where }),
  ]);
  return { meta: { total, page, limit: take }, data };
};

const deleteFromDB = async (user: TUserJwtPayload, scheduleId: string) => {
  const doctor = await prisma.doctor.findUniqueOrThrow({ where: { email: user.email } });
  const slot = await prisma.doctorSchedule.findUnique({
    where: { scheduleId_doctorId: { scheduleId, doctorId: doctor.id } },
  });
  if (!slot) throw new AppError(httpStatus.NOT_FOUND, "Slot not found in your schedule");
  if (slot.isBooked) throw new AppError(httpStatus.CONFLICT, "This slot is booked and cannot be removed");
  const hasHistory = await prisma.appointment.count({ where: { doctorId: doctor.id, scheduleId } });
  if (hasHistory) {
    throw new AppError(httpStatus.CONFLICT, "This slot has booking history and cannot be removed");
  }
  await prisma.doctorSchedule.delete({ where: { scheduleId_doctorId: { scheduleId, doctorId: doctor.id } } });
  await audit({ actor: user, action: "DOCTOR_SCHEDULE_REMOVED", entity: "Doctor", entityId: doctor.id, metadata: { scheduleId } });
  return { scheduleId };
};

/**
 * Public availability: which doctors are free when. By default only future, unbooked,
 * non-deleted slots of active doctors are returned (booked slots never show as available).
 */
const getAllFromDB = async (filters: Record<string, unknown>, options: any, user?: TUserJwtPayload) => {
  const { page, skip, take } = normalizeQueryParams(options);
  const and: Prisma.DoctorScheduleWhereInput[] = [
    { schedule: { isDeleted: false } },
    { doctor: { isDeleted: false } },
  ];
  // Doctors see their own slots (booked and free) — this is what the doctor "My schedules" page lists.
  if (user?.role === "DOCTOR") return getMySchedule({ ...filters, upcoming: filters.upcoming ?? "false" }, options, user);
  const isAdmin = user?.role === "ADMIN";
  const isBooked = toBool(filters.isBooked);
  if (isBooked !== undefined && isAdmin) and.push({ isBooked });
  else if (!isAdmin) and.push({ isBooked: false });
  if (!isAdmin || filters.upcoming === "true") and.push({ schedule: { startDateTime: { gt: new Date() } } });
  if (typeof filters.doctorId === "string") and.push({ doctorId: filters.doctorId });
  if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(String(filters.date))) {
    const start = new Date(`${filters.date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    and.push({ schedule: { startDateTime: { gte: start, lt: end } } });
  }
  if (typeof filters.searchTerm === "string" && filters.searchTerm.trim()) {
    and.push({ doctor: { name: { contains: filters.searchTerm.trim().slice(0, 64), mode: "insensitive" } } });
  }
  const where: Prisma.DoctorScheduleWhereInput = { AND: and };
  const [data, total] = await Promise.all([
    prisma.doctorSchedule.findMany({
      where,
      skip,
      take,
      include: {
        schedule: true,
        doctor: { select: { id: true, name: true, profilePhoto: true, designation: true, appointmentFee: true, averageRating: true } },
      },
      orderBy: { schedule: { startDateTime: "asc" } },
    }),
    prisma.doctorSchedule.count({ where }),
  ]);
  return { meta: { total, page, limit: take }, data };
};

export const doctorScheduleService = { createDoctorSchedule, getAllFromDB, getMySchedule, deleteFromDB };
