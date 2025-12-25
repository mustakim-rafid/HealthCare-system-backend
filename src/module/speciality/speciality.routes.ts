import { Router } from "express";
import { specialityController } from "./speciality.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";
import { fileUploader } from "../../helper/fileUploader";

const router = Router()

router.route("/").get(
    specialityController.getAllSpecialities
)

router.route("/").post(
    checkAuth(Role.ADMIN),
    fileUploader.upload.single("icon"),
    specialityController.createSpeciality
)

router.route("/:id").delete(
    checkAuth(Role.ADMIN),
    specialityController.deleteSpeciality
)

export const specialityRoutes = router