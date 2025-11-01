import { Router } from "express";
import { doctorSpecialityController } from "./doctorSpeciality.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router()

router.route("/").post(
    checkAuth(Role.DOCTOR),
    doctorSpecialityController.createDoctorSpeciality
)

export const doctorSpecialityRoutes = router