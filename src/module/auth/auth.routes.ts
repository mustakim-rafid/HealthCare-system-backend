import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { authController } from "./auth.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { zodValidator } from "../../middlewares/zodValidator";
import { authLimiter } from "../../middlewares/rateLimiter";

const router = Router();

const password = z.string().min(8, "Password must be at least 8 characters").max(128);

router.post(
  "/login",
  authLimiter,
  zodValidator(z.object({ email: z.email("Enter a valid email"), password: z.string().min(1, "Password is required").max(128) })),
  authController.login
);
router.post("/logout", authController.logout);
router.get("/getme", authController.getMe);
router.post("/refresh-token", authController.refreshToken);
router.patch(
  "/change-password",
  authLimiter,
  checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
  zodValidator(z.object({ oldPassword: z.string().min(1, "Old password is required"), newPassword: z.string().min(6, "Password must be at least 6 characters").max(128) })),
  authController.changePassword
);
router.post("/forgot-password", authLimiter, zodValidator(z.object({ email: z.email("Enter a valid email") })), authController.forgotPassword);
router.post(
  "/reset-password",
  authLimiter,
  zodValidator(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid reset token"), password })),
  authController.resetPassword
);

export const authRoutes = router;
