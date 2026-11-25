/**
 * Integration tests against a real Postgres (DATABASE_URL). They create their own
 * isolated doctor/patient/slots and clean nothing global. Skipped when RUN_DB_TESTS != "true".
 *   RUN_DB_TESTS=true npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import type Stripe from "stripe";

const enabled = process.env.RUN_DB_TESTS === "true";
process.env.NODE_ENV = "test";

describe.skipIf(!enabled)("booking (database)", async () => {
  const { prisma } = await import("../src/utils/prisma");
  const { appointmentService } = await import("../src/module/appointment/appointment.service");
  const { paymentService } = await import("../src/module/payment/payment.service");
  const jobs = await import("../src/jobs");

  const tag = randomUUID().slice(0, 8);
  const patientEmail = `t-patient-${tag}@test.dev`;
  const doctorEmail = `t-doctor-${tag}@test.dev`;
  const patientUser = { email: patientEmail, role: "PATIENT" as const };
  const doctorUser = { email: doctorEmail, role: "DOCTOR" as const };
  let doctorId = "";
  const slotIds: string[] = [];

  const makeSlot = async (minutesFromNow: number) => {
    const start = new Date(Date.now() + minutesFromNow * 60_000);
    const s = await prisma.schedule.create({ data: { startDateTime: start, endDateTime: new Date(start.getTime() + 30 * 60_000) } });
    await prisma.doctorSchedule.create({ data: { scheduleId: s.id, doctorId } });
    slotIds.push(s.id);
    return s.id;
  };

  const markPaid = async (appointmentId: string) => {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { appointmentId } });
    const session = {
      id: `cs_test_${randomUUID().replace(/-/g, "")}`,
      payment_status: "paid",
      amount_total: Math.round(payment.amount * 100),
      currency: (process.env.PAYMENT_CURRENCY || "bdt").toLowerCase(),
      payment_intent: `pi_test_${tag}`,
      metadata: { appointmentId, paymentId: payment.id },
    } as unknown as Stripe.Checkout.Session;
    return session;
  };

  beforeAll(async () => {
    await prisma.user.create({ data: { email: patientEmail, password: "x", role: "PATIENT" } });
    await prisma.paitent.create({ data: { email: patientEmail, name: "Test Patient" } });
    await prisma.user.create({ data: { email: doctorEmail, password: "x", role: "DOCTOR" } });
    const doc = await prisma.doctor.create({
      data: { email: doctorEmail, name: "Test Doctor", registrationNumber: tag, gender: "MALE", appointmentFee: 100, qualification: "MBBS", currentWorkingPlace: "Test", designation: "Test" },
    });
    doctorId = doc.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("prevents double booking under concurrency", async () => {
    const slot = await makeSlot(24 * 60 * 3);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => appointmentService.createAppointmentWithPayLater(patientUser, { doctorId, scheduleId: slot }))
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
  });

  it("rejects booking a slot in the past", async () => {
    const slot = await makeSlot(-60);
    await expect(appointmentService.createAppointmentWithPayLater(patientUser, { doctorId, scheduleId: slot })).rejects.toThrow(/past/);
  });

  it("confirms payment exactly once even if the webhook is retried", async () => {
    const slot = await makeSlot(24 * 60 * 4);
    const appt = await appointmentService.createAppointmentWithPayLater(patientUser, { doctorId, scheduleId: slot });
    const session = await markPaid(appt.id);
    const results = await Promise.all([paymentService.confirmFromSession(session), paymentService.confirmFromSession(session)]);
    expect(results.map((r) => r.status).sort()).toEqual(["already_confirmed", "confirmed"]);
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.paymentStatus).toBe("PAID");
    const confirmations = await prisma.notification.count({ where: { appointmentId: appt.id, type: "BOOKING_CONFIRMED", userEmail: patientEmail } });
    expect(confirmations).toBe(1);
  });

  it("rejects a session whose amount does not match", async () => {
    const slot = await makeSlot(24 * 60 * 5);
    const appt = await appointmentService.createAppointmentWithPayLater(patientUser, { doctorId, scheduleId: slot });
    const session = await markPaid(appt.id);
    (session as unknown as { amount_total: number }).amount_total = 1;
    await expect(paymentService.confirmFromSession(session)).rejects.toThrow(/mismatch/);
  });

  it("releases expired holds back to the pool", async () => {
    const slot = await makeSlot(24 * 60 * 6);
    const appt = await appointmentService.createAppointmentWithPayLater(patientUser, { doctorId, scheduleId: slot });
    await prisma.appointment.update({ where: { id: appt.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await jobs.releaseExpiredHolds();
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(after.status).toBe("CANCELLED");
    const ds = await prisma.doctorSchedule.findUniqueOrThrow({ where: { scheduleId_doctorId: { scheduleId: slot, doctorId } } });
    expect(ds.isBooked).toBe(false);
  });

  it("sends the 10-minute reminder once (idempotent)", async () => {
    const slot = await makeSlot(24 * 60 * 7);
    const appt = await appointmentService.createAppointmentWithPayLater(patientUser, { doctorId, scheduleId: slot });
    await paymentService.confirmFromSession(await markPaid(appt.id));
    // Move the slot to start in 5 minutes
    const start = new Date(Date.now() + 5 * 60_000);
    await prisma.schedule.update({ where: { id: slot }, data: { startDateTime: start, endDateTime: new Date(start.getTime() + 30 * 60_000) } });
    await Promise.all([jobs.sendDueReminders(), jobs.sendDueReminders()]);
    await jobs.sendDueReminders();
    const reminders = await prisma.notification.count({ where: { appointmentId: appt.id, type: "REMINDER", userEmail: patientEmail } });
    expect(reminders).toBe(1);
  });

  it("prevents a patient from holding two overlapping appointments", async () => {
    const start = 24 * 60 * 8;
    const slotA = await makeSlot(start);
    const slotB = await makeSlot(start + 10); // overlaps A
    await appointmentService.createAppointmentWithPayLater(patientUser, { doctorId, scheduleId: slotA });
    await expect(appointmentService.createAppointmentWithPayLater(patientUser, { doctorId, scheduleId: slotB })).rejects.toThrow(/already have/);
  });

  it("enforces ownership and role permissions", async () => {
    const slot = await makeSlot(24 * 60 * 9);
    const appt = await appointmentService.createAppointmentWithPayLater(patientUser, { doctorId, scheduleId: slot });
    const stranger = { email: "nobody@test.dev", role: "PATIENT" as const };
    await expect(appointmentService.getAppointmentById(appt.id, stranger)).rejects.toThrow(/not found/i);
    await expect(appointmentService.updateAppointmentStatus(appt.id, "COMPLETED", patientUser)).rejects.toThrow(/only cancel/);
    await expect(appointmentService.updateAppointmentStatus(appt.id, "CONFIRMED", doctorUser)).rejects.toThrow(/cannot set/);
  });
});
