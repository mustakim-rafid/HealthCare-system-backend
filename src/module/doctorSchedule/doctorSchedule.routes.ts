import { Router } from "express";
import { doctorScheduleController } from "./doctorSchedule.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router()

router.route("/").post(
    checkAuth(Role.DOCTOR),
    doctorScheduleController.createDoctorSchedule
)

export const doctorScheduleRoutes = router