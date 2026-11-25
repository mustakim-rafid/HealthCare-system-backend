import { Router } from "express";
import { doctorScheduleController } from "./doctorSchedule.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";
import { z } from "zod";
import { zodValidator } from "../../middlewares/zodValidator";

const router = Router()

router.route("/").post(
    checkAuth(Role.DOCTOR),
    zodValidator(z.object({ scheduleIds: z.array(z.string().uuid("Invalid slot id")).min(1, "Select at least one slot").max(200) })),
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