import { Router } from "express";
import { authController } from "./auth.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router()

router.route("/login").post(authController.login)
router.route("/getme").get(authController.getMe)
router.route("/refresh-token").post(authController.refreshToken)
router.route("/change-password").patch(
    checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    authController.changePassword
)

export const authRoutes = router