import { z } from "zod";

const id = (label: string) => z.string({ error: `${label} is required` }).trim().uuid(`${label} is invalid`);

export const createAppointmentZodSchema = z.object({
  doctorId: id("Doctor id"),
  scheduleId: id("Schedule id"),
});

export const updateStatusZodSchema = z.object({
  status: z.string().min(1, "Status is required"),
  reason: z.string().trim().max(500).optional(),
});

export const cancelZodSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const meetLinkZodSchema = z.object({
  meetLink: z.string().trim().min(1, "Meet link is required").max(200),
});

export const postponeZodSchema = z.object({
  newScheduleId: id("New slot"),
  message: z.string().trim().min(5, "Please write a short message to the patient").max(1000),
});

export const postponeResponseZodSchema = z.object({
  action: z.enum(["accept", "cancel"], { error: "Action must be accept or cancel" }),
});

export const messageZodSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(2000),
});
