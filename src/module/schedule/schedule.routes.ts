import { Router } from "express";
import { scheduleController } from "./schedule.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router()

router.route("/").post(
    checkAuth(Role.ADMIN),
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

export const scheduleRoutes = router