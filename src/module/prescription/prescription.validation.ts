import z from "zod";

export const createPrescriptionZodSchema = z.object({
    appointmentId: z.string(),
    followUpDate: z.date(),
    instructions: z.string()
})