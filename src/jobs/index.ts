import { AppointmentStatus, PaymentStatus } from "@prisma/client";
import { formatInAppTz } from "../helper/time";
import config from "../config";
import { prisma } from "../utils/prisma";
import { logger } from "../utils/logger";
import { notify } from "../module/notification/notification.service";
import { paymentService } from "../module/payment/payment.service";
import { audit } from "../helper/audit";

/**
 * Background jobs. All state lives in the database (holdExpiresAt, reminderSentAt,
 * startingSentAt, completedAt), so jobs survive restarts and simply catch up on the next tick.
 * Every send is "claimed" with a conditional updateMany first, so even with several
 * instances running the same tick a reminder is delivered at most once.
 */

const TICK_MS = 30_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

/** Unpaid holds past their expiry → cancelled, slot released. */
export const releaseExpiredHolds = async (now = new Date()) => {
  const expired = await prisma.appointment.findMany({
    where: { status: AppointmentStatus.PENDING_PAYMENT, holdExpiresAt: { lt: now }, paymentStatus: PaymentStatus.UNPAID },
    select: { id: true },
    take: 100,
  });
  for (const a of expired) await paymentService.releaseHold(a.id, "Payment was not completed in time");
  return expired.length;
};

/** Reminder N minutes (default 10) before start. */
export const sendDueReminders = async (now = new Date()) => {
  const windowEnd = new Date(now.getTime() + config.booking.reminder_minutes_before * 60 * 1000);
  const due = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.CONFIRMED,
      isDeleted: false,
      reminderSentAt: null,
      schedule: { startDateTime: { gt: now, lte: windowEnd } },
    },
    include: { schedule: true, doctor: { select: { name: true, email: true } }, patient: { select: { name: true, email: true } } },
    take: 200,
  });
  let sent = 0;
  for (const a of due) {
    const claim = await prisma.appointment.updateMany({ where: { id: a.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claim.count === 0) continue; // another tick/instance already sent it
    const mins = Math.max(1, Math.round((a.schedule.startDateTime.getTime() - now.getTime()) / 60000));
    const at = formatInAppTz(a.schedule.startDateTime, { timeOnly: true });
    await notify({
      userEmail: a.patient.email,
      type: "REMINDER",
      title: `Your consultation starts in ${mins} min`,
      message: `Consultation with ${a.doctor.name} starts at ${at}.${a.meetLink ? " Open the booking to join the Google Meet." : ""}`,
      link: `/dashboard/my-appointments/${a.id}`,
      appointmentId: a.id,
      email: true,
    });
    await notify({
      userEmail: a.doctor.email,
      type: "REMINDER",
      title: `Consultation in ${mins} min`,
      message: `${a.patient.name} at ${at}.${a.meetLink ? "" : " You have not shared a Meet link yet."}`,
      link: `/doctor/dashboard/appointments`,
      appointmentId: a.id,
    });
    sent++;
  }
  return sent;
};

/** "Starting now" when the start time is reached. */
export const sendStartingNow = async (now = new Date()) => {
  const due = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.CONFIRMED,
      isDeleted: false,
      startingSentAt: null,
      schedule: { startDateTime: { lte: now }, endDateTime: { gt: now } },
    },
    include: { doctor: { select: { name: true } }, patient: { select: { email: true } } },
    take: 200,
  });
  for (const a of due) {
    const claim = await prisma.appointment.updateMany({ where: { id: a.id, startingSentAt: null }, data: { startingSentAt: now } });
    if (claim.count === 0) continue;
    await notify({
      userEmail: a.patient.email,
      type: "STARTING_NOW",
      title: "Your consultation is starting now",
      message: `${a.doctor.name} is ready. ${a.meetLink ? "Click to join the Google Meet." : "Open your booking for details."}`,
      link: `/dashboard/my-appointments/${a.id}`,
      appointmentId: a.id,
    });
  }
  return due.length;
};

/** Paid consultations whose end time has passed → COMPLETED. */
export const autoCompleteFinished = async (now = new Date()) => {
  const finished = await prisma.appointment.findMany({
    where: {
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.INPROGRESS] },
      paymentStatus: PaymentStatus.PAID,
      isDeleted: false,
      schedule: { endDateTime: { lt: now } },
    },
    include: { doctor: { select: { name: true } }, patient: { select: { email: true } } },
    take: 200,
  });
  for (const a of finished) {
    const res = await prisma.appointment.updateMany({
      where: { id: a.id, status: a.status },
      data: { status: AppointmentStatus.COMPLETED, completedAt: now },
    });
    if (res.count === 0) continue;
    await audit({ action: "STATUS_COMPLETED_AUTO", entity: "Appointment", entityId: a.id });
    await notify({
      userEmail: a.patient.email,
      type: "SYSTEM",
      title: "How was your consultation?",
      message: `Your consultation with ${a.doctor.name} is complete. Leave a quick review to help other patients.`,
      link: `/dashboard/my-appointments/${a.id}`,
      appointmentId: a.id,
    });
  }
  return finished.length;
};

export const runJobsOnce = async () => {
  if (running) return; // never overlap ticks
  running = true;
  try {
    const now = new Date();
    await releaseExpiredHolds(now);
    await sendDueReminders(now);
    await sendStartingNow(now);
    await autoCompleteFinished(now);
  } catch (err) {
    logger.error("Background job tick failed", { err: err as Error });
  } finally {
    running = false;
  }
};

export const startJobs = () => {
  if (timer) return;
  void runJobsOnce();
  timer = setInterval(() => void runJobsOnce(), TICK_MS);
  logger.info("Background jobs started", { tickSeconds: TICK_MS / 1000 });
};

export const stopJobs = () => {
  if (timer) clearInterval(timer);
  timer = null;
};
