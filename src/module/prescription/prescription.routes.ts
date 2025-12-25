import { Router } from "express";
import { prescriptionController } from "./prescription.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";
import { createPrescriptionZodSchema } from "./prescription.validation";
import { zodValidator } from "../../middlewares/zodValidator";

const router = Router()

router.route("/").post(
    checkAuth(Role.DOCTOR),
    zodValidator(createPrescriptionZodSchema),
    prescriptionController.createPrescription
)

router.get(
    '/',
    checkAuth(Role.ADMIN),
    prescriptionController.getAllFromDB
);

router.get(
    '/my-prescription',
    checkAuth(Role.PATIENT),
    prescriptionController.patientPrescription
)

export const prescriptionRoutes = router