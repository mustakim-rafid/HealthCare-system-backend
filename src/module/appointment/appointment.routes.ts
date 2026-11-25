import { Router } from "express";
import { Role } from "@prisma/client";
import { appointmentController } from "./appointment.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { zodValidator } from "../../middlewares/zodValidator";
import {
  cancelZodSchema,
  createAppointmentZodSchema,
  meetLinkZodSchema,
  messageZodSchema,
  postponeResponseZodSchema,
  postponeZodSchema,
  updateStatusZodSchema,
} from "./appointment.validation";

const router = Router();
const anyRole = checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT);

// Booking (slot hold + Stripe checkout)
router.post("/", checkAuth(Role.PATIENT), zodValidator(createAppointmentZodSchema), appointmentController.createAppointment);
// Backward compatible alias used by the previous client
router.post("/pay-later", checkAuth(Role.PATIENT), zodValidator(createAppointmentZodSchema), appointmentController.createAppointmentWithPayLater);

// Lists are role-scoped (admin: all, doctor: own, patient: own)
router.get("/", anyRole, appointmentController.list);
router.get("/my-appointment", anyRole, appointmentController.list);

router.get("/:id", anyRole, appointmentController.getById);

router.patch("/:id/update-status", checkAuth(Role.DOCTOR, Role.ADMIN, Role.PATIENT), zodValidator(updateStatusZodSchema), appointmentController.updateStatus);
// Alias for the route the previous client called
router.patch("/status/:id", anyRole, zodValidator(updateStatusZodSchema), appointmentController.updateStatus);

router.post("/:id/cancel", anyRole, zodValidator(cancelZodSchema), appointmentController.cancel);
router.patch("/:id/meet-link", checkAuth(Role.DOCTOR, Role.ADMIN), zodValidator(meetLinkZodSchema), appointmentController.setMeetLink);
router.post("/:id/postpone", checkAuth(Role.DOCTOR), zodValidator(postponeZodSchema), appointmentController.postpone);
router.post("/:id/postpone/respond", checkAuth(Role.PATIENT), zodValidator(postponeResponseZodSchema), appointmentController.respondPostpone);

router.get("/:id/messages", anyRole, appointmentController.listMessages);
router.post("/:id/messages", anyRole, zodValidator(messageZodSchema), appointmentController.createMessage);

export const appointmentRoutes = router;
