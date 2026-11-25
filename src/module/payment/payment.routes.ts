import { Router } from "express";
import { Role } from "@prisma/client";
import { checkAuth } from "../../middlewares/CheckAuth";
import { paymentController } from "./payment.controller";

const router = Router();

// (The webhook itself is mounted in app.ts because it needs the raw request body.)
router.post("/checkout/:appointmentId", checkAuth(Role.PATIENT), paymentController.createCheckoutSession);
router.post("/verify", checkAuth(Role.PATIENT), paymentController.verifySession);

export const paymentRoutes = router;
