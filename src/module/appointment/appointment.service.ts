import { AppointmentStatus, PaymentStatus, Prisma, Role } from "@prisma/client";
import httpStatus from "http-status";
import { v4 as uuidv4 } from "uuid";
import { formatInAppTz } from "../../helper/time";
import config from "../../config";
import { prisma } from "../../utils/prisma";
import { AppError } from "../../utils/AppError";
import { TUserJwtPayload } from "../../types";
import { audit } from "../../helper/audit";
import { isStripeConfigured } from "../../helper/stripe";
import { logger } from "../../utils/logger";
import { notify, notifyAdmins } from "../notification/notification.service";
import { paymentService } from "../payment/payment.service";
import { claimSlot, releaseSlot } from "./appointment.slots";
import {
  ACTIVE_STATUSES,
  canTransition,
  isBeforeCancellationCutoff,
  isValidMeetLink,
  MANUAL_STATUS_BY_ROLE,
  normalizeStatus,
  sanitizeSearchTerm,
} from "./appointment.rules";

const fmt = (d: Date) => formatInAppTz(d);

/** Fields of the patient that a doctor/admin may see. */
const patientPublicSelect = {
  id: true,
  name: true,
  email: true,
  contactNumber: true,
  address: true,
  profilePhoto: true,
} satisfies Prisma.PaitentSelect;

const doctorPublicSelect = {
  id: true,
  name: true,
  email: true,
  profilePhoto: true,
  contactNumber: true,
  address: true,
  designation: true,
  qualification: true,
  experience: true,
  appointmentFee: true,
  currentWorkingPlace: true,
  averageRating: true,
  gender: true,
  doctorSpeciality: { include: { speciality: true } },
} satisfies Prisma.DoctorSelect;

const paymentPublicSelect = {
  id: true,
  amount: true,
  paymentStatus: true,
  transactionId: true,
  paidAt: true,
  refundedAt: true,
  createdAt: true,
} satisfies Prisma.PaymentSelect;

const appointmentInclude = {
  doctor: { select: doctorPublicSelect },
  patient: { select: patientPublicSelect },
  schedule: true,
  payment: { select: paymentPublicSelect },
  prescription: true,
  Review: true,
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

/** The Meet link is only revealed to the patient once the booking is paid and confirmed. */
const MEET_VISIBLE_STATUSES: AppointmentStatus[] = ["CONFIRMED", "INPROGRESS", "COMPLETED", "SCHEDULED"];
const shapeForUser = <T extends { meetLink: string | null; status: AppointmentStatus; paymentStatus: PaymentStatus }>(
  appointment: T,
  user: TUserJwtPayload
) => {
  if (user.role === Role.PATIENT) {
    const visible = MEET_VISIBLE_STATUSES.includes(appointment.status) && appointment.paymentStatus === PaymentStatus.PAID;
    return { ...appointment, meetLink: visible ? appointment.meetLink : null };
  }
  return appointment;
};

/** Loads an appointment and enforces ownership (patient → own, doctor → own, admin → all). */
const getOwnedAppointment = async (id: string, user: TUserJwtPayload) => {
  const appointment = await prisma.appointment.findFirst({
    where: { id, isDeleted: false },
    include: appointmentInclude,
  });
  if (!appointment) throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
  const isOwner =
    user.role === Role.ADMIN ||
    (user.role === Role.PATIENT && appointment.patient.email === user.email) ||
    (user.role === Role.DOCTOR && appointment.doctor.email === user.email);
  // 404 (not 403) so ids of other people's appointments cannot be probed
  if (!isOwner) throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
  return appointment;
};

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

/**
 * Creates a booking in PENDING_PAYMENT and holds the slot for SLOT_HOLD_MINUTES.
 * Everything runs in one transaction:
 *  - per-patient advisory lock (prevents the same patient double-booking overlapping times concurrently)
 *  - slot must be in the future, not deleted and offered by that doctor
 *  - patient must not already have an active booking overlapping this time
 *  - atomic slot claim (isBooked false -> true) — the double-booking guard
 */
const holdSlot = async (payload: { doctorId: string; scheduleId: string }, user: TUserJwtPayload) => {
  const patient = await prisma.paitent.findFirst({ where: { email: user.email, isDeleted: false } });
  if (!patient) throw new AppError(httpStatus.NOT_FOUND, "Patient profile not found");

  const doctor = await prisma.doctor.findFirst({
    where: { id: payload.doctorId, isDeleted: false, user: { status: "ACTIVE" } },
  });
  if (!doctor) throw new AppError(httpStatus.NOT_FOUND, "Doctor not found");

  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + config.booking.slot_hold_minutes * 60 * 1000);

  const appointment = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${patient.id}))`;

      const slot = await tx.doctorSchedule.findUnique({
        where: { scheduleId_doctorId: { scheduleId: payload.scheduleId, doctorId: doctor.id } },
        include: { schedule: true },
      });
      if (!slot || slot.schedule.isDeleted) throw new AppError(httpStatus.NOT_FOUND, "This slot is not offered by the doctor");
      if (slot.schedule.startDateTime <= now) throw new AppError(httpStatus.BAD_REQUEST, "You cannot book a slot in the past");

      const clash = await tx.appointment.findFirst({
        where: {
          patientId: patient.id,
          isDeleted: false,
          status: { in: ACTIVE_STATUSES },
          NOT: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
          schedule: {
            startDateTime: { lt: slot.schedule.endDateTime },
            endDateTime: { gt: slot.schedule.startDateTime },
          },
        },
      });
      if (clash) throw new AppError(httpStatus.CONFLICT, "You already have an appointment at this time");

      const claimed = await claimSlot(tx, doctor.id, payload.scheduleId);
      if (!claimed) throw new AppError(httpStatus.CONFLICT, "Sorry, this slot was just booked by someone else");

      const created = await tx.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          scheduleId: payload.scheduleId,
          videoCallingId: uuidv4(),
          status: AppointmentStatus.PENDING_PAYMENT,
          holdExpiresAt,
        },
        include: appointmentInclude,
      });
      await tx.payment.create({
        data: { appointmentId: created.id, amount: doctor.appointmentFee, transactionId: uuidv4() },
      });
      await audit(
        { actor: user, action: "BOOKING_CREATED", entity: "Appointment", entityId: created.id, metadata: { scheduleId: payload.scheduleId } },
        tx
      );
      return created;
    },
    { timeout: 15_000 }
  );

  await notify({
    userEmail: patient.email,
    type: "BOOKING_CREATED",
    title: "Slot reserved — complete payment",
    message: `Your slot with ${doctor.name} on ${fmt(appointment.schedule.startDateTime)} is held for ${config.booking.slot_hold_minutes} minutes. Complete payment to confirm it.`,
    link: `/dashboard/my-appointments/${appointment.id}`,
    appointmentId: appointment.id,
  });

  return appointment;
};

/** POST /appointment — hold the slot and immediately open a Stripe Checkout session. */
const createAppointment = async (payload: { doctorId: string; scheduleId: string; returnOrigin?: string }, user: TUserJwtPayload) => {
  const appointment = await holdSlot(payload, user);
  let paymentUrl: string | null = null;
  if (isStripeConfigured()) {
    try {
      const session = await paymentService.createCheckoutSession(appointment.id, user, payload.returnOrigin);
      paymentUrl = session.paymentUrl;
    } catch (err) {
      // The hold stays valid; the patient can retry payment from the booking page.
      logger.error("Failed to create checkout session", { appointmentId: appointment.id, err: err as Error });
    }
  }
  return { appointment: shapeForUser(appointment, user), paymentUrl, holdExpiresAt: appointment.holdExpiresAt };
};

/**
 * POST /appointment/pay-later — kept for backward compatibility with the previous client.
 * It now creates the same held PENDING_PAYMENT booking (confirmed only after payment).
 */
const createAppointmentWithPayLater = async (user: TUserJwtPayload, payload: { doctorId: string; scheduleId: string }) => {
  const appointment = await holdSlot(payload, user);
  return shapeForUser(appointment, user);
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const SORTABLE = ["createdAt", "updatedAt", "startDateTime", "status"] as const;

const buildListQuery = (query: Record<string, unknown>, user: TUserJwtPayload) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const sortBy = SORTABLE.includes(query.sortBy as (typeof SORTABLE)[number]) ? (query.sortBy as string) : "createdAt";
  const sortOrder: Prisma.SortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  const and: Prisma.AppointmentWhereInput[] = [{ isDeleted: false }];
  if (user.role === Role.DOCTOR) and.push({ doctor: { email: user.email } });
  if (user.role === Role.PATIENT) and.push({ patient: { email: user.email } });

  const statuses = String(query.status ?? "")
    .split(",")
    .map((s) => normalizeStatus(s))
    .filter(Boolean) as AppointmentStatus[];
  if (statuses.length) and.push({ status: { in: statuses } });
  if (query.paymentStatus && ["PAID", "UNPAID", "REFUNDED"].includes(String(query.paymentStatus))) {
    and.push({ paymentStatus: query.paymentStatus as PaymentStatus });
  }
  if (user.role === Role.ADMIN && typeof query.doctorId === "string") and.push({ doctorId: query.doctorId });
  if (user.role === Role.ADMIN && typeof query.patientId === "string") and.push({ patientId: query.patientId });
  if (query.upcoming === "true") and.push({ schedule: { startDateTime: { gte: new Date() } } });
  if (query.past === "true") and.push({ schedule: { startDateTime: { lt: new Date() } } });

  const term = sanitizeSearchTerm(query.searchTerm);
  if (term) {
    and.push({
      OR: [
        { doctor: { name: { contains: term, mode: "insensitive" } } },
        { patient: { name: { contains: term, mode: "insensitive" } } },
        { patient: { email: { contains: term, mode: "insensitive" } } },
        { id: { startsWith: term } },
      ],
    });
  }

  const orderBy: Prisma.AppointmentOrderByWithRelationInput =
    sortBy === "startDateTime" ? { schedule: { startDateTime: sortOrder } } : { [sortBy]: sortOrder };

  return { where: { AND: and }, orderBy, page, limit };
};

const listAppointments = async (query: Record<string, unknown>, user: TUserJwtPayload) => {
  const { where, orderBy, page, limit } = buildListQuery(query, user);
  const [data, total] = await Promise.all([
    prisma.appointment.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: appointmentInclude }),
    prisma.appointment.count({ where }),
  ]);
  return { meta: { page, limit, total }, data: data.map((a) => shapeForUser(a, user)) };
};

const getAppointmentById = async (id: string, user: TUserJwtPayload) => {
  const appointment = await getOwnedAppointment(id, user);
  const proposedSchedule = appointment.proposedScheduleId
    ? await prisma.schedule.findUnique({ where: { id: appointment.proposedScheduleId } })
    : null;
  const canCancelWithRefund = isBeforeCancellationCutoff(
    appointment.schedule.startDateTime,
    config.booking.cancellation_cutoff_hours
  );
  return {
    ...shapeForUser(appointment, user),
    proposedSchedule,
    policy: {
      cancellationCutoffHours: config.booking.cancellation_cutoff_hours,
      canCancelWithRefund,
      paymentEnabled: isStripeConfigured(),
    },
  };
};

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

const updateAppointmentStatus = async (id: string, rawStatus: string, user: TUserJwtPayload, reason?: string) => {
  const status = normalizeStatus(rawStatus);
  if (!status) throw new AppError(httpStatus.BAD_REQUEST, "Invalid status");

  // Patients cancel through the cancellation endpoint (policy + refund aware)
  if (user.role === Role.PATIENT) {
    if (status !== AppointmentStatus.CANCELLED) throw new AppError(httpStatus.FORBIDDEN, "Patients can only cancel appointments");
    return cancelAppointment(id, user, reason);
  }

  const allowed = MANUAL_STATUS_BY_ROLE[user.role] ?? [];
  if (!allowed.includes(status)) throw new AppError(httpStatus.FORBIDDEN, `You cannot set status to ${status}`);
  if (status === AppointmentStatus.CANCELLED) return cancelAppointment(id, user, reason);

  const appointment = await getOwnedAppointment(id, user);
  if (!canTransition(appointment.status, status)) {
    throw new AppError(httpStatus.CONFLICT, `Cannot change status from ${appointment.status} to ${status}`);
  }
  if ((status === "INPROGRESS" || status === "COMPLETED" || status === "NO_SHOW") && appointment.paymentStatus !== "PAID") {
    throw new AppError(httpStatus.CONFLICT, "Only paid appointments can be started or completed");
  }
  if ((status === "COMPLETED" || status === "NO_SHOW") && appointment.schedule.startDateTime > new Date()) {
    throw new AppError(httpStatus.CONFLICT, "This appointment has not started yet");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.appointment.updateMany({
      where: { id, status: appointment.status },
      data: { status, ...(status === "COMPLETED" ? { completedAt: new Date() } : {}) },
    });
    if (res.count === 0) throw new AppError(httpStatus.CONFLICT, "Appointment was modified, please refresh");
    await audit({ actor: user, action: `STATUS_${status}`, entity: "Appointment", entityId: id, metadata: { from: appointment.status } }, tx);
    return tx.appointment.findUniqueOrThrow({ where: { id }, include: appointmentInclude });
  });
  return shapeForUser(updated, user);
};

/**
 * Cancellation policy:
 *  - Unpaid holds can always be cancelled (slot released).
 *  - Patients can cancel a paid booking only before the cutoff (CANCELLATION_CUTOFF_HOURS) → full refund.
 *  - Doctors/admins can cancel any active booking → full refund to the patient.
 */
const cancelAppointment = async (id: string, user: TUserJwtPayload, reason?: string) => {
  const appointment = await getOwnedAppointment(id, user);
  if (!canTransition(appointment.status, AppointmentStatus.CANCELLED)) {
    throw new AppError(httpStatus.CONFLICT, `A ${appointment.status.toLowerCase()} appointment cannot be cancelled`);
  }
  const isPaid = appointment.paymentStatus === PaymentStatus.PAID;
  if (user.role === Role.PATIENT && isPaid) {
    if (!isBeforeCancellationCutoff(appointment.schedule.startDateTime, config.booking.cancellation_cutoff_hours)) {
      throw new AppError(
        httpStatus.CONFLICT,
        `Paid appointments can only be cancelled at least ${config.booking.cancellation_cutoff_hours} hours before the start time`
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    const res = await tx.appointment.updateMany({
      where: { id, status: appointment.status },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: user.role,
        cancelReason: reason?.slice(0, 500) || null,
        holdExpiresAt: null,
      },
    });
    if (res.count === 0) throw new AppError(httpStatus.CONFLICT, "Appointment was modified, please refresh");
    await releaseSlot(tx, appointment.doctorId, appointment.scheduleId);
    if (appointment.proposedScheduleId) await releaseSlot(tx, appointment.doctorId, appointment.proposedScheduleId);
    await audit({ actor: user, action: "BOOKING_CANCELLED", entity: "Appointment", entityId: id, metadata: { reason: reason ?? null, wasPaid: isPaid } }, tx);
  });

  const refund = isPaid ? await paymentService.refundPayment(id, reason || "Cancelled") : { refunded: false };

  const when = fmt(appointment.schedule.startDateTime);
  const refundNote = isPaid ? (refund.refunded ? " A full refund has been issued." : " Our team will process your refund shortly.") : "";
  if (user.role !== Role.PATIENT) {
    await notify({
      userEmail: appointment.patient.email,
      type: "BOOKING_CANCELLED",
      title: "Appointment cancelled",
      message: `Your consultation with ${appointment.doctor.name} on ${when} was cancelled.${reason ? ` Reason: ${reason}.` : ""}${refundNote}`,
      link: `/dashboard/my-appointments/${id}`,
      appointmentId: id,
      email: true,
    });
  }
  if (user.role !== Role.DOCTOR && appointment.status !== "PENDING_PAYMENT") {
    await notify({
      userEmail: appointment.doctor.email,
      type: "BOOKING_CANCELLED",
      title: "Appointment cancelled",
      message: `${appointment.patient.name}'s consultation on ${when} was cancelled.`,
      link: `/doctor/dashboard/appointments`,
      appointmentId: id,
    });
  }
  const updated = await prisma.appointment.findUniqueOrThrow({ where: { id }, include: appointmentInclude });
  return { ...shapeForUser(updated, user), refunded: refund.refunded };
};

// ---------------------------------------------------------------------------
// Meet link
// ---------------------------------------------------------------------------

const setMeetLink = async (id: string, meetLink: string, user: TUserJwtPayload) => {
  const link = String(meetLink ?? "").trim();
  if (!isValidMeetLink(link)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Please enter a valid Google Meet link, e.g. https://meet.google.com/abc-defg-hij");
  }
  const appointment = await getOwnedAppointment(id, user);
  if (user.role !== Role.DOCTOR && user.role !== Role.ADMIN) throw new AppError(httpStatus.FORBIDDEN, "Not allowed");
  if (appointment.paymentStatus !== PaymentStatus.PAID || !["CONFIRMED", "INPROGRESS", "SCHEDULED"].includes(appointment.status)) {
    throw new AppError(httpStatus.CONFLICT, "A Meet link can only be shared for paid, confirmed appointments");
  }
  const updated = await prisma.appointment.update({ where: { id }, data: { meetLink: link }, include: appointmentInclude });
  await audit({ actor: user, action: "MEET_LINK_SHARED", entity: "Appointment", entityId: id });
  await notify({
    userEmail: appointment.patient.email,
    type: "MEET_LINK_ADDED",
    title: appointment.meetLink ? "Meeting link updated" : "Meeting link shared",
    message: `${appointment.doctor.name} shared the Google Meet link for your consultation on ${fmt(appointment.schedule.startDateTime)}.`,
    link: `/dashboard/my-appointments/${id}`,
    appointmentId: id,
    email: true,
  });
  return updated;
};

// ---------------------------------------------------------------------------
// Postponement
// ---------------------------------------------------------------------------

const postponeAppointment = async (
  id: string,
  payload: { newScheduleId: string; message: string },
  user: TUserJwtPayload
) => {
  const appointment = await getOwnedAppointment(id, user);
  if (user.role !== Role.DOCTOR) throw new AppError(httpStatus.FORBIDDEN, "Only the doctor can postpone an appointment");
  if (!canTransition(appointment.status, AppointmentStatus.POSTPONED) || appointment.paymentStatus !== PaymentStatus.PAID) {
    throw new AppError(httpStatus.CONFLICT, "Only paid, confirmed appointments can be postponed");
  }
  if (payload.newScheduleId === appointment.scheduleId) throw new AppError(httpStatus.BAD_REQUEST, "Pick a different time slot");

  await prisma.$transaction(async (tx) => {
    const slot = await tx.doctorSchedule.findUnique({
      where: { scheduleId_doctorId: { scheduleId: payload.newScheduleId, doctorId: appointment.doctorId } },
      include: { schedule: true },
    });
    if (!slot || slot.schedule.isDeleted) throw new AppError(httpStatus.NOT_FOUND, "Pick one of your own available slots");
    if (slot.schedule.startDateTime <= new Date()) throw new AppError(httpStatus.BAD_REQUEST, "The new slot must be in the future");
    const claimed = await claimSlot(tx, appointment.doctorId, payload.newScheduleId);
    if (!claimed) throw new AppError(httpStatus.CONFLICT, "That slot is no longer available");

    const res = await tx.appointment.updateMany({
      where: { id, status: appointment.status },
      data: { status: AppointmentStatus.POSTPONED, proposedScheduleId: payload.newScheduleId, postponeMessage: payload.message },
    });
    if (res.count === 0) throw new AppError(httpStatus.CONFLICT, "Appointment was modified, please refresh");
    await tx.appointmentMessage.create({
      data: { appointmentId: id, senderEmail: user.email, senderRole: Role.DOCTOR, body: payload.message },
    });
    await audit({ actor: user, action: "BOOKING_POSTPONED", entity: "Appointment", entityId: id, metadata: { from: appointment.scheduleId, to: payload.newScheduleId } }, tx);
  });

  const proposed = await prisma.schedule.findUniqueOrThrow({ where: { id: payload.newScheduleId } });
  await notify({
    userEmail: appointment.patient.email,
    type: "APPOINTMENT_POSTPONED",
    title: "Your appointment was postponed",
    message: `${appointment.doctor.name}: "${payload.message}". New proposed time: ${fmt(proposed.startDateTime)}. Please accept it or cancel for a refund.`,
    link: `/dashboard/my-appointments/${id}`,
    appointmentId: id,
    email: true,
  });
  await notifyAdmins({
    type: "APPOINTMENT_POSTPONED",
    title: "Appointment postponed",
    message: `${appointment.doctor.name} postponed ${appointment.patient.name}'s appointment.`,
    appointmentId: id,
  });
  return getAppointmentById(id, user);
};

/** Patient accepts the new slot (old slot released) or cancels (both slots released + refund). */
const respondToPostponement = async (id: string, action: "accept" | "cancel", user: TUserJwtPayload) => {
  const appointment = await getOwnedAppointment(id, user);
  if (user.role !== Role.PATIENT) throw new AppError(httpStatus.FORBIDDEN, "Only the patient can respond");
  if (appointment.status !== AppointmentStatus.POSTPONED || !appointment.proposedScheduleId) {
    throw new AppError(httpStatus.CONFLICT, "This appointment is not waiting for your response");
  }
  const proposedScheduleId = appointment.proposedScheduleId;

  if (action === "accept") {
    await prisma.$transaction(async (tx) => {
      const res = await tx.appointment.updateMany({
        where: { id, status: AppointmentStatus.POSTPONED },
        data: {
          status: AppointmentStatus.CONFIRMED,
          scheduleId: proposedScheduleId,
          proposedScheduleId: null,
          reminderSentAt: null,
          startingSentAt: null,
        },
      });
      if (res.count === 0) throw new AppError(httpStatus.CONFLICT, "Appointment was modified, please refresh");
      await releaseSlot(tx, appointment.doctorId, appointment.scheduleId);
      await audit({ actor: user, action: "POSTPONEMENT_ACCEPTED", entity: "Appointment", entityId: id }, tx);
    });
  } else {
    await prisma.$transaction(async (tx) => {
      const res = await tx.appointment.updateMany({
        where: { id, status: AppointmentStatus.POSTPONED },
        data: {
          status: AppointmentStatus.CANCELLED,
          proposedScheduleId: null,
          cancelledAt: new Date(),
          cancelledBy: Role.PATIENT,
          cancelReason: "Patient declined the postponed time",
        },
      });
      if (res.count === 0) throw new AppError(httpStatus.CONFLICT, "Appointment was modified, please refresh");
      await releaseSlot(tx, appointment.doctorId, appointment.scheduleId);
      await releaseSlot(tx, appointment.doctorId, proposedScheduleId);
      await audit({ actor: user, action: "POSTPONEMENT_DECLINED", entity: "Appointment", entityId: id }, tx);
    });
    // Doctor-initiated change: full refund regardless of the cutoff
    await paymentService.refundPayment(id, "Patient declined postponed time");
  }

  await notify({
    userEmail: appointment.doctor.email,
    type: "POSTPONE_RESPONSE",
    title: action === "accept" ? "New time accepted" : "Patient cancelled after postponement",
    message:
      action === "accept"
        ? `${appointment.patient.name} accepted the new time for their consultation.`
        : `${appointment.patient.name} declined the new time; the appointment was cancelled and refunded.`,
    link: `/doctor/dashboard/appointments`,
    appointmentId: id,
  });
  return getAppointmentById(id, user);
};

// ---------------------------------------------------------------------------
// Messages (doctor ↔ patient, visible to admin)
// ---------------------------------------------------------------------------

const listMessages = async (id: string, user: TUserJwtPayload) => {
  await getOwnedAppointment(id, user);
  return prisma.appointmentMessage.findMany({ where: { appointmentId: id }, orderBy: { createdAt: "asc" }, take: 200 });
};

const createMessage = async (id: string, body: string, user: TUserJwtPayload) => {
  const appointment = await getOwnedAppointment(id, user);
  const message = await prisma.appointmentMessage.create({
    data: { appointmentId: id, senderEmail: user.email, senderRole: user.role, body },
  });
  const recipients =
    user.role === Role.PATIENT
      ? [{ email: appointment.doctor.email, link: `/doctor/dashboard/appointments` }]
      : user.role === Role.DOCTOR
        ? [{ email: appointment.patient.email, link: `/dashboard/my-appointments/${id}` }]
        : [
            { email: appointment.patient.email, link: `/dashboard/my-appointments/${id}` },
            { email: appointment.doctor.email, link: `/doctor/dashboard/appointments` },
          ];
  await Promise.all(
    recipients.map((r) =>
      notify({
        userEmail: r.email,
        type: "NEW_MESSAGE",
        title: "New message about your appointment",
        message: body.length > 140 ? body.slice(0, 137) + "..." : body,
        link: r.link,
        appointmentId: id,
      })
    )
  );
  return message;
};

/** Legacy endpoint used by the previous client (`GET /appointment/my-appointment`). */
const getMyAppointment = async (user: TUserJwtPayload, query: Record<string, unknown>) => listAppointments(query, user);

export const appointmentService = {
  createAppointment,
  createAppointmentWithPayLater,
  listAppointments,
  getMyAppointment,
  getAppointmentById,
  updateAppointmentStatus,
  cancelAppointment,
  setMeetLink,
  postponeAppointment,
  respondToPostponement,
  listMessages,
  createMessage,
};

export type { AppointmentWithRelations };
