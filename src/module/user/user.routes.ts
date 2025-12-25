import { NextFunction, Request, Response, Router } from "express";
import { userController } from "./user.controller";
import { fileUploader } from "../../helper/fileUploader";
import { userInputZodSchema } from "./user.validation";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";
import { userZodValidator } from "../../middlewares/userZodValidator";

const router = Router();

router.route("/").get(checkAuth(Role.ADMIN), userController.getAllUsersFromDB);

router
  .route("/create-patient")
  .post(
    fileUploader.upload.single("file"),
    userZodValidator(userInputZodSchema.patientInputZodSchema),
    userController.createPatient
  );

router
  .route("/create-doctor")
  .post(
    checkAuth(Role.ADMIN),
    fileUploader.upload.single("file"),
    userZodValidator(userInputZodSchema.doctorInputZodSchema),
    userController.createDoctor
  );

router
  .route("/create-admin")
  .post(
    checkAuth(Role.ADMIN),
    fileUploader.upload.single("file"),
    userZodValidator(userInputZodSchema.adminInputZodSchema),
    userController.createAdmin
  );

router
  .route("/profile-data")
  .get(
    checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    userController.getProfileData
  );

router.patch(
    "/update-my-profile",
    checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    fileUploader.upload.single('file'),
    (req: Request, res: Response, next: NextFunction) => {
        req.body = JSON.parse(req.body.data)
        return userController.updateMyProfie(req, res, next)
    }
);

export const userRoutes = router;
