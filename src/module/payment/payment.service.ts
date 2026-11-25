import Stripe from "stripe";
import httpStatus from "http-status";
import { AppointmentStatus, PaymentStatus, Role } from "@prisma/client";
import config from "../../config";
import { getStripe } from "../../helper/stripe";
import { AppError } from "../../utils/AppError";
import { prisma } from "../../utils/prisma";
import { logger } from "../../utils/logger";
import { audit } from "../../helper/audit";
import { notify, notifyAdmins } from "../notification/notification.service";
import { TUserJwtPayload } from "../../types";
import { claimSlot, releaseSlot } from "../appointment/appointment.slots";
import { format } from "date-fns";

const STRIPE_MIN_EXPIRY_MS = 31 * 60 * 1000;

/**
 * Creates a Stripe Checkout session for a held (PENDING_PAYMENT) booking.
 * This is the same Checkout + webhook flow the project already had (it was commented out);
 * only the safety around it (ownership, amount from DB, idempotency) is new.
 */
/**
 * Where Stripe sends the patient back. The frontend passes its own origin; it is accepted only if it
 * is in the CLIENT_URL allowlist (or CLIENT_URL is not configured yet), otherwise CLIENT_URL is used.
 */
const resolveReturnOrigin = (requested?: string) => {
  if (requested && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(requested)) {
    const origin = requested.replace(/\/$/, "");
    if (config.client_urls.includes(origin) || !config.client_url_configured) return origin;
  }
  return config.client_url;
};

const createCheckoutSession = async (appointmentId: string, user: TUserJwtPayload, returnOrigin?: string) => {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, isDeleted: false, patient: { email: user.email } },
    include: { doctor: true, payment: true, patient: true, schedule: true },
  });
  if (!appointment || !appointment.payment) throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
  if (appointment.paymentStatus === PaymentStatus.PAID) {
    throw new AppError(httpStatus.CONFLICT, "This appointment is already paid");
  }
  if (!["PENDING_PAYMENT", "SCHEDULED"].includes(appointment.status)) {
    throw new AppError(httpStatus.CONFLICT, `Cannot pay for an appointment that is ${appointment.status.toLowerCase()}`);
  }
  if (appointment.schedule.startDateTime <= new Date()) {
    throw new AppError(httpStatus.CONFLICT, "This appointment time has already passed");
  }

  // Stripe requires a session expiry >= 30 minutes; keep the slot held for at least that long.
  const expiresAt = new Date(
    Math.max(appointment.holdExpiresAt?.getTime() ?? 0, Date.now() + STRIPE_MIN_EXPIRY_MS)
  );
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    customer_email: appointment.patient.email,
    line_items: [
      {
        price_data: {
          currency: config.payment_currency,
          product_data: {
            name: `Consultation with ${appointment.doctor.name}`,
            description: format(appointment.schedule.startDateTime, "PPpp") + " (UTC)",
          },
          unit_amount: Math.round(appointment.payment.amount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { appointmentId: appointment.id, paymentId: appointment.payment.id },
    mode: "payment",
    expires_at: Math.floor(expiresAt.getTime() / 1000),
    success_url: `${resolveReturnOrigin(returnOrigin)}/dashboard/payment/success?session_id={CHECKOUT_SESSION_ID}&appointmentId=${appointment.id}`,
    cancel_url: `${resolveReturnOrigin(returnOrigin)}/dashboard/my-appointments/${appointment.id}?payment=cancelled`,
  });

  await prisma.$transaction([
    prisma.payment.update({ where: { id: appointment.payment.id }, data: { stripeSessionId: session.id } }),
    prisma.appointment.update({
      where: { id: appointment.id },
      data: { holdExpiresAt: appointment.status === "PENDING_PAYMENT" ? new Date(expiresAt.getTime() + 60_000) : null },
    }),
  ]);

  return { paymentUrl: session.url, sessionId: session.id, expiresAt };
};

/**
 * Idempotent payment confirmation shared by the webhook and the success-page verification.
 * A retried webhook (or webhook + verify racing) can never confirm twice: the payment row is
 * flipped UNPAID -> PAID with a conditional update and only the winner proceeds.
 */
const confirmFromSession = async (session: Stripe.Checkout.Session) => {
  const appointmentId = session.metadata?.appointmentId;
  const paymentId = session.metadata?.paymentId;
  if (!appointmentId || !paymentId) throw new AppError(httpStatus.BAD_REQUEST, "Session is missing booking metadata");
  if (session.payment_status !== "paid") return { status: "unpaid" as const, appointmentId };

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.appointmentId !== appointmentId) {
    throw new AppError(httpStatus.BAD_REQUEST, "Payment does not match booking");
  }
  // Never trust amounts from the client: compare what Stripe charged with what we expect.
  const expected = Math.round(payment.amount * 100);
  if (session.amount_total !== expected || session.currency !== config.payment_currency.toLowerCase()) {
    logger.error("Stripe amount mismatch", { appointmentId, expected, got: session.amount_total });
    throw new AppError(httpStatus.BAD_REQUEST, "Payment amount mismatch");
  }
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  const outcome = await prisma.$transaction(async (tx) => {
    const flipped = await tx.payment.updateMany({
      where: { id: paymentId, paymentStatus: PaymentStatus.UNPAID },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paidAt: new Date(),
        stripeSessionId: session.id,
        paymentIntentId,
        paymentGatewayData: { id: session.id, payment_status: session.payment_status, amount_total: session.amount_total, currency: session.currency },
      },
    });
    if (flipped.count === 0) return "already" as const;

    const appointment = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });

    // Late payment after the hold expired: try to win the slot back, otherwise refund.
    if (appointment.status === AppointmentStatus.CANCELLED) {
      const reclaimed = await claimSlot(tx, appointment.doctorId, appointment.scheduleId);
      if (!reclaimed) return "refund" as const;
    }

    await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        confirmedAt: new Date(),
        holdExpiresAt: null,
        cancelledAt: null,
        cancelReason: null,
        cancelledBy: null,
      },
    });
    await audit({ action: "PAYMENT_CONFIRMED", entity: "Appointment", entityId: appointmentId, metadata: { sessionId: session.id } }, tx);
    return "confirmed" as const;
  });

  if (outcome === "refund") {
    await refundPayment(appointmentId, "Slot no longer available after late payment");
    return { status: "refunded" as const, appointmentId };
  }
  if (outcome === "confirmed") await notifyBookingConfirmed(appointmentId);
  return { status: outcome === "already" ? ("already_confirmed" as const) : ("confirmed" as const), appointmentId };
};

const notifyBookingConfirmed = async (appointmentId: string) => {
  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: true, patient: true, schedule: true },
  });
  if (!a) return;
  const when = format(a.schedule.startDateTime, "PPpp") + " UTC";
  await notify({
    userEmail: a.patient.email,
    type: "BOOKING_CONFIRMED",
    title: "Booking confirmed",
    message: `Your consultation with ${a.doctor.name} on ${when} is confirmed.`,
    link: `/dashboard/my-appointments/${a.id}`,
    appointmentId: a.id,
    email: true,
  });
  await notify({
    userEmail: a.doctor.email,
    type: "BOOKING_CONFIRMED",
    title: "New confirmed booking",
    message: `${a.patient.name} booked a consultation on ${when}. Add a Google Meet link when ready.`,
    link: `/doctor/dashboard/appointments?appointment=${a.id}`,
    appointmentId: a.id,
    email: true,
  });
  await notifyAdmins({
    type: "BOOKING_CONFIRMED",
    title: "New paid booking",
    message: `${a.patient.name} → ${a.doctor.name} on ${when}.`,
    link: `/admin/dashboard/appointments-management`,
    appointmentId: a.id,
  });
};

/** Called by the frontend success page with the session id from Stripe's redirect. */
const verifySession = async (sessionId: string, user: TUserJwtPayload) => {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new AppError(httpStatus.BAD_REQUEST, "Invalid session id");
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const appointment = await prisma.appointment.findFirst({
    where: { id: session.metadata?.appointmentId ?? "", patient: { email: user.email } },
    select: { id: true },
  });
  if (!appointment) throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
  return confirmFromSession(session);
};

/** Stripe webhook: signature is always verified; unknown events are acknowledged. */
const handleWebhook = async (rawBody: Buffer, signature: string | undefined) => {
  if (!config.stripe_webhook_secret) throw new AppError(httpStatus.SERVICE_UNAVAILABLE, "Webhook secret not configured");
  if (!signature) throw new AppError(httpStatus.BAD_REQUEST, "Missing Stripe signature");
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, config.stripe_webhook_secret);
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", { err: err as Error });
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid webhook signature");
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return confirmFromSession(event.data.object as Stripe.Checkout.Session);
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const id = session.metadata?.appointmentId;
      if (id) await releaseHold(id, event.type === "checkout.session.expired" ? "Payment window expired" : "Payment failed");
      return { status: "released" };
    }
    default:
      return { status: "ignored", type: event.type };
  }
};

/** Cancels an unpaid hold and returns the slot to the pool (idempotent). */
const releaseHold = async (appointmentId: string, reason: string) => {
  const released = await prisma.$transaction(async (tx) => {
    const a = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!a || a.status !== AppointmentStatus.PENDING_PAYMENT || a.paymentStatus === PaymentStatus.PAID) return null;
    const res = await tx.appointment.updateMany({
      where: { id: appointmentId, status: AppointmentStatus.PENDING_PAYMENT },
      data: { status: AppointmentStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason, holdExpiresAt: null },
    });
    if (res.count === 0) return null;
    await releaseSlot(tx, a.doctorId, a.scheduleId);
    await audit({ action: "BOOKING_HOLD_RELEASED", entity: "Appointment", entityId: appointmentId, metadata: { reason } }, tx);
    return a;
  });
  if (released) {
    const patient = await prisma.paitent.findUnique({ where: { id: released.patientId } });
    if (patient) {
      await notify({
        userEmail: patient.email,
        type: "PAYMENT_FAILED",
        title: "Booking released",
        message: `${reason}. The slot was released — you can book again any time.`,
        link: `/dashboard/my-appointments/${appointmentId}`,
        appointmentId,
      });
    }
  }
  return Boolean(released);
};

/**
 * Full refund through Stripe for a PAID booking. Safe to call more than once.
 * If Stripe refuses, the booking stays cancelled and admins are alerted to refund manually.
 */
const refundPayment = async (appointmentId: string, reason: string) => {
  const payment = await prisma.payment.findUnique({ where: { appointmentId } });
  if (!payment || payment.paymentStatus !== PaymentStatus.PAID) return { refunded: false };
  try {
    if (!payment.paymentIntentId) throw new Error("No payment intent recorded for this payment");
    const refund = await getStripe().refunds.create(
      { payment_intent: payment.paymentIntentId, reason: "requested_by_customer", metadata: { appointmentId } },
      { idempotencyKey: `refund-${payment.id}` }
    );
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { paymentStatus: PaymentStatus.REFUNDED, refundId: refund.id, refundedAt: new Date() },
      }),
      prisma.appointment.update({ where: { id: appointmentId }, data: { paymentStatus: PaymentStatus.REFUNDED } }),
    ]);
    await audit({ action: "PAYMENT_REFUNDED", entity: "Appointment", entityId: appointmentId, metadata: { refundId: refund.id, reason } });
    return { refunded: true };
  } catch (err) {
    logger.error("Refund failed", { appointmentId, err: err as Error });
    await audit({ action: "PAYMENT_REFUND_FAILED", entity: "Appointment", entityId: appointmentId, metadata: { reason } });
    await notifyAdmins({
      type: "SYSTEM",
      title: "Manual refund required",
      message: `Automatic refund failed for appointment ${appointmentId}. Please refund it from the Stripe dashboard.`,
      appointmentId,
    });
    return { refunded: false };
  }
};

export const paymentService = {
  createCheckoutSession,
  verifySession,
  handleWebhook,
  confirmFromSession,
  releaseHold,
  refundPayment,
  notifyBookingConfirmed,
};

export type { Role };
