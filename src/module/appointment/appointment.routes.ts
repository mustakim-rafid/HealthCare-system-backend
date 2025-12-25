import { Router } from "express";
import { appointmentController } from "./appointment.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";
import { zodValidator } from "../../middlewares/zodValidator";
import { createAppointmentZodSchema } from "./appointment.validation";

const router = Router()

router.route("/").post(
    checkAuth(Role.PATIENT),
    appointmentController.createAppointment
)

router.route("/").get(
    checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    appointmentController.getAllAppointments
)

router.route("/:id/update-status").patch(
    checkAuth(Role.DOCTOR),
    appointmentController.updateAppointmentStatus
)

router.get(
    '/my-appointment',
    checkAuth(Role.PATIENT, Role.DOCTOR),
    appointmentController.getMyAppointment
)

router.post(
    '/pay-later',
    checkAuth(Role.PATIENT),
    zodValidator(createAppointmentZodSchema),
    appointmentController.createAppointmentWithPayLater
);

export const appointmentRoutes = router