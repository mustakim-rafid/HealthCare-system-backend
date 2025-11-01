import { Router } from "express";
import { authController } from "./auth.controller";

const router = Router()

router.route("/login").post(authController.login)
router.route("/getme").get(authController.getMe)
router.route("/refresh-token").post(authController.refreshToken)

export const authRoutes = router