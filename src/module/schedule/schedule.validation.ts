import z from "zod";

export const createScheduleZodSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])$/, {
      message: "Invalid date format. Expected YYYY-MM-DD or YYYY-M-D",
    })
    .refine((value) => {
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      );
    }, "Invalid calendar date"),
  endDate: z
    .string()
    .regex(/^\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])$/, {
      message: "Invalid date format. Expected YYYY-MM-DD or YYYY-M-D",
    })
    .refine((value) => {
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      );
    }, "Invalid calendar date"),
  startTime: z
    .string()
    .regex(
      /^(?:[0-9]|1\d|2[0-3]):[0-5]\d$/,
      "Invalid time format. Expected H:MM or HH:MM (24-hour)"
    ),
  endTime: z
    .string()
    .regex(
      /^(?:[0-9]|1\d|2[0-3]):[0-5]\d$/,
      "Invalid time format. Expected H:MM or HH:MM (24-hour)"
    ),
});
