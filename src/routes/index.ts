import { Router } from "express";
import { userRoutes } from "../module/user/user.routes";
import { authRoutes } from "../module/auth/auth.routes";
import { scheduleRoutes } from "../module/schedule/schedule.routes";
import { doctorScheduleRoutes } from "../module/doctorSchedule/doctorSchedule.routes";
import { specialityRoutes } from "../module/speciality/speciality.routes";
import { doctorSpecialityRoutes } from "../module/doctorSpeciality/doctorSpeciality.routes";
import { doctorRoutes } from "../module/doctor/doctor.routes";
import { appointmentRoutes } from "../module/appointment/appointment.routes";
import { prescriptionRoutes } from "../module/prescription/prescription.routes";
import { reviewRoutes } from "../module/review/review.routes";
import { patientRoutes } from "../module/patient/patient.routes";
import { MetaRoutes } from "../module/meta/meta.routes";

const router = Router();

const moduleRoutes: {
  path: string;
  route: Router;
}[] = [
  {
    path: "/user",
    route: userRoutes,
  },
  {
    path: "/auth",
    route: authRoutes,
  },
  {
    path: "/schedule",
    route: scheduleRoutes
  },
  {
    path: "/doctor-schedule",
    route: doctorScheduleRoutes
  },
  {
    path: "/speciality",
    route: specialityRoutes
  },
  {
    path: "/doctor-speciality",
    route: doctorSpecialityRoutes
  },
  {
    path: "/doctor",
    route: doctorRoutes
  },
  {
    path: "/appointment",
    route: appointmentRoutes
  },
  {
    path: "/prescription",
    route: prescriptionRoutes
  },
  {
    path: "/review",
    route: reviewRoutes
  },
  {
    path: "/patient",
    route: patientRoutes
  },
  {
    path: "/meta",
    route: MetaRoutes
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
