import { z } from "zod";

export const createAppointmentZodSchema = z.object({
  doctorId: z.string({
    error: "Doctor Id is required!",
  }),
  scheduleId: z.string({
    error: "Doctor schedule id is required!",
  }),
});
