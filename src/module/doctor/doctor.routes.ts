import { Router } from "express";
import { doctorController } from "./doctor.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router()

router.route("/:id").get(
    checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    doctorController.getDoctorById
)

router.route("/").get(
    checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    doctorController.getAllDoctors
)
router.route("/").patch(
    checkAuth(Role.DOCTOR),
    doctorController.updateDoctor
)

// ******************* AI Driven Doctor Suggestion  ********************************

export const doctorRoutes = router