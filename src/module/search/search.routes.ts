import { Request, Response, Router } from "express";
import { Prisma, Role } from "@prisma/client";
import httpStatus from "http-status";
import { checkAuth } from "../../middlewares/CheckAuth";
import { searchLimiter } from "../../middlewares/rateLimiter";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { prisma } from "../../utils/prisma";
import { TUserJwtPayload } from "../../types";
import { sanitizeSearchTerm } from "../appointment/appointment.rules";

type SearchItem = { id: string; title: string; subtitle?: string; href: string };
type SearchGroups = { doctors: SearchItem[]; patients: SearchItem[]; bookings: SearchItem[]; specialities: SearchItem[] };

const ci = (term: string) => ({ contains: term, mode: "insensitive" as const });

/**
 * Global dashboard search. Results are scoped by role:
 *  - admin:   doctors, patients, all bookings, specialities
 *  - doctor:  only their own patients and bookings
 *  - patient: doctors (public directory), specialities, and only their own bookings
 * Input is sanitised and only ever used through Prisma parameterised `contains` filters
 * (no regex, no raw SQL), so it cannot be used for injection.
 */
export const globalSearch = async (rawTerm: unknown, user: TUserJwtPayload, limit = 5): Promise<SearchGroups> => {
  const term = sanitizeSearchTerm(rawTerm);
  const empty: SearchGroups = { doctors: [], patients: [], bookings: [], specialities: [] };
  if (term.length < 2) return empty;

  const bookingScope: Prisma.AppointmentWhereInput =
    user.role === Role.DOCTOR
      ? { doctor: { email: user.email } }
      : user.role === Role.PATIENT
        ? { patient: { email: user.email } }
        : {};

  const bookingHref = (id: string) =>
    user.role === Role.PATIENT
      ? `/dashboard/my-appointments/${id}`
      : user.role === Role.DOCTOR
        ? `/doctor/dashboard/appointments?appointment=${id}`
        : `/admin/dashboard/appointments-management?appointment=${id}`;

  const [doctors, patients, bookings, specialities] = await Promise.all([
    user.role === Role.DOCTOR
      ? Promise.resolve([])
      : prisma.doctor.findMany({
          where: {
            isDeleted: false,
            OR: [
              { name: ci(term) },
              { designation: ci(term) },
              { doctorSpeciality: { some: { speciality: { title: ci(term) } } } },
              ...(user.role === Role.ADMIN ? [{ email: ci(term) }] : []),
            ],
          },
          select: { id: true, name: true, designation: true, email: true },
          take: limit,
        }),
    user.role === Role.PATIENT
      ? Promise.resolve([])
      : prisma.paitent.findMany({
          where: {
            isDeleted: false,
            OR: [{ name: ci(term) }, { email: ci(term) }, { contactNumber: ci(term) }],
            ...(user.role === Role.DOCTOR ? { appointment: { some: { doctor: { email: user.email } } } } : {}),
          },
          select: { id: true, name: true, email: true },
          take: limit,
        }),
    prisma.appointment.findMany({
      where: {
        isDeleted: false,
        ...bookingScope,
        OR: [
          { doctor: { name: ci(term) } },
          { patient: { name: ci(term) } },
          { id: { startsWith: term.toLowerCase() } },
        ],
      },
      select: {
        id: true,
        status: true,
        doctor: { select: { name: true } },
        patient: { select: { name: true } },
        schedule: { select: { startDateTime: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    user.role === Role.DOCTOR
      ? Promise.resolve([])
      : prisma.speciality.findMany({ where: { title: ci(term) }, select: { id: true, title: true }, take: limit }),
  ]);

  return {
    doctors: doctors.map((d) => ({
      id: d.id,
      title: d.name,
      subtitle: d.designation,
      href: user.role === Role.ADMIN ? `/admin/dashboard/doctor-management?searchTerm=${encodeURIComponent(d.name)}` : `/consultation/doctor/${d.id}`,
    })),
    patients: patients.map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: p.email,
      href:
        user.role === Role.ADMIN
          ? `/admin/dashboard/patient-management?searchTerm=${encodeURIComponent(p.email)}`
          : `/doctor/dashboard/appointments?searchTerm=${encodeURIComponent(p.name)}`,
    })),
    bookings: bookings.map((b) => ({
      id: b.id,
      title: user.role === Role.PATIENT ? `With ${b.doctor.name}` : user.role === Role.DOCTOR ? `With ${b.patient.name}` : `${b.patient.name} → ${b.doctor.name}`,
      subtitle: `${b.schedule.startDateTime.toISOString()}|${b.status}`,
      href: bookingHref(b.id),
    })),
    specialities: specialities.map((s) => ({
      id: s.id,
      title: s.title,
      href: user.role === Role.ADMIN ? `/admin/dashboard/speciality-management` : `/consultation?speciality=${encodeURIComponent(s.title)}`,
    })),
  };
};

const router = Router();

router.get(
  "/",
  searchLimiter,
  checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
  catchAsync(async (req: Request, res: Response) => {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
    const data = await globalSearch(req.query.q, req.user, limit);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Search results", data });
  })
);

export const searchRoutes = router;
