import { Router } from "express";
import { prescriptionController } from "./prescription.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router()

router.route("/").post(
    checkAuth(Role.DOCTOR),
    prescriptionController.createPrescription
)

export const prescriptionRoutes = router