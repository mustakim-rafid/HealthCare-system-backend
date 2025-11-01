import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { reviewService } from "./review.service";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status"

const createReview = catchAsync(async (req: Request, res: Response) => {
    const result = await reviewService.createReview(req.user, req.body)
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Review created successfully",
        data: result
    })
})

export const reviewController = {
    createReview
}