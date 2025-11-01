import { Router } from "express";
import { specialityController } from "./speciality.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";
import { fileUploader } from "../../helper/fileUploader";

const router = Router()

router.route("/").get(
    checkAuth(Role.ADMIN, Role.DOCTOR),
    specialityController.getAllSpecialities
)

router.route("/").post(
    checkAuth(Role.ADMIN),
    fileUploader.upload.single("icon"),
    specialityController.createSpeciality
)

export const specialityRoutes = router