import { Router } from "express";
import { appointmentController } from "./appointment.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

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

export const appointmentRoutes = router