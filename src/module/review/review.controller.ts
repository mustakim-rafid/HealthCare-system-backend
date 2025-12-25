import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { reviewService } from "./review.service";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status"
import { pick } from "../../helper/pick";

const createReview = catchAsync(async (req: Request, res: Response) => {
    const result = await reviewService.createReview(req.user, req.body)
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Review created successfully",
        data: result
    })
})

const getAllReviews = catchAsync(async (req: Request, res: Response) => {
    const filters = pick(req.query, ["patientEmail", "doctorEmail"]);
    const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
    const result = await reviewService.getAllReviews(filters, options);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Reviews retrieval successfully',
        meta: result.meta,
        data: result.data,
    });
});

export const reviewController = {
    createReview,
    getAllReviews
}