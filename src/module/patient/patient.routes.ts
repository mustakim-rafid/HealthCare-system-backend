import { Router } from "express";
import { patientController } from "./patient.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router()

router.route("/").get(
    checkAuth(Role.ADMIN),
    patientController.getAllPatients
)
router.route("/:id").get(patientController.getPatientById)
router.route("/").patch(
    checkAuth(Role.PATIENT),
    patientController.updatePatient
)

export const patientRoutes = router