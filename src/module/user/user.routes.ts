import { Router } from "express";
import { userController } from "./user.controller";
import { fileUploader } from "../../helper/fileUploader";
import { zodValidator } from "../../middlewares/zodValidator";
import { userInputZodSchema } from "./user.validation";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router();

router.route("/").get(checkAuth(Role.ADMIN), userController.getAllUsersFromDB);

router
  .route("/create-patient")
  .post(
    fileUploader.upload.single("file"),
    zodValidator(userInputZodSchema.patientInputZodSchema),
    userController.createPatient
  );

router
  .route("/create-doctor")
  .post(
    checkAuth(Role.ADMIN),
    fileUploader.upload.single("file"),
    zodValidator(userInputZodSchema.doctorInputZodSchema),
    userController.createDoctor
  );

router
  .route("/create-admin")
  .post(
    checkAuth(Role.ADMIN),
    fileUploader.upload.single("file"),
    zodValidator(userInputZodSchema.adminInputZodSchema),
    userController.createAdmin
  );

router
  .route("/profile-data")
  .get(
    checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    userController.getProfileData
  );

export const userRoutes = router;
