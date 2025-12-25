import { Router } from "express";
import { doctorScheduleController } from "./doctorSchedule.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router()

router.route("/").post(
    checkAuth(Role.DOCTOR),
    doctorScheduleController.createDoctorSchedule
)

router.get(
    '/',
    checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    doctorScheduleController.getAllFromDB
);

router.get(
    '/my-schedule',
    checkAuth(Role.DOCTOR),
    doctorScheduleController.getMySchedule
)

router.delete(
    '/:id',
    checkAuth(Role.DOCTOR),
    doctorScheduleController.deleteFromDB
);

export const doctorScheduleRoutes = router