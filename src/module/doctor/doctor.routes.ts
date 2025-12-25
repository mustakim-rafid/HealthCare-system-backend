import { Router } from "express";
import { doctorController } from "./doctor.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router()

router.route("/:id").get(
    doctorController.getDoctorById
)

router.route("/").get(
    doctorController.getAllDoctors
)

router.route("/:id").patch(
    checkAuth(Role.ADMIN, Role.DOCTOR),
    doctorController.updateDoctor
)

router.route("/:id").delete(
    checkAuth(Role.ADMIN),
    doctorController.deleteDoctor
)

router.route("/soft-delete/:id").delete(
    checkAuth(Role.ADMIN),
    doctorController.softDeleteDoctor
)

// ******************* AI Driven Doctor Suggestion  ********************************
router.route("/suggestion").post(
    doctorController.doctorSuggestion
)

export const doctorRoutes = router