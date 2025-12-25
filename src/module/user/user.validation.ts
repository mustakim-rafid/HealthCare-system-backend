import { Gender, Role } from "@prisma/client";
import z from "zod";

const patientInputZodSchema = z.object({
  password: z.string().min(6, "Password must be 6 characters"),
  patient: z.object({
    name: z.string().nonempty("Name is required"),
    email: z.email().nonempty("Email is required"),
    contactNumber: z.string().optional(),
    address: z.string().optional(),
  }),
});

const doctorInputZodSchema = z.object({
  password: z.string().min(6, "Password must be 6 characters"),
  doctor: z.object({
    name: z.string().nonempty("Name is required"),
    email: z.email().nonempty("Email is required"),
    contactNumber: z.string().optional(),
    address: z.string().optional(),
    role: z.string().default(Role.DOCTOR),
    registrationNumber: z.string().nonempty("Registration number is required"),
    gender: z.enum([Gender.MALE, Gender.FEMALE]),
    appointmentFee: z.number(),
    qualification: z.string().nonempty("Qualification is required"),
    currentWorkingPlace: z.string().nonempty("Current working place is required"),
    designation: z.string().nonempty("Designation is required"),
    specialities: z.array(z.string()).min(1, "At least one speciality is required")
  }),
});

const adminInputZodSchema = z.object({
  password: z.string().min(6, "Password must be 6 characters"),
  admin: z.object({
    name: z.string().nonempty("Name is required"),
    email: z.email().nonempty("Email is required"),
    contactNumber: z.string().optional()
  }),
});

export const userInputZodSchema = {
    patientInputZodSchema,
    doctorInputZodSchema,
    adminInputZodSchema
}
