import { Router } from "express";
import { reviewController } from "./review.controller";
import { checkAuth } from "../../middlewares/CheckAuth";
import { Role } from "@prisma/client";

const router = Router()

router.route("/").post(
    checkAuth(Role.PATIENT),
    reviewController.createReview
)

export const reviewRoutes = router