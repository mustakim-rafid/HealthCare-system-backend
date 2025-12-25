import { Router } from "express";
import { scheduleController } from "./schedule.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";
import { zodValidator } from "../../middlewares/zodValidator";
import { createScheduleZodSchema } from "./schedule.validation";

const router = Router()

router.route("/").post(
    checkAuth(Role.ADMIN),
    zodValidator(createScheduleZodSchema),
    scheduleController.createSchedule
)

router.route("/").get(
    checkAuth(Role.ADMIN, Role.DOCTOR),
    scheduleController.getAllAvailableSchedules
)

router.route("/:id").delete(
    checkAuth(Role.ADMIN),
    scheduleController.deleteScheduleById
)

router.get(
    '/:id',
    checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    scheduleController.getByIdFromDB
);

export const scheduleRoutes = router