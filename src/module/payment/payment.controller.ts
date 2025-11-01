import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { paymentService } from "./payment.service";
import sendResponse from "../../utils/sendResponse";

const paymentVerification = catchAsync(async (req: Request, res: Response) => {
    const result = await paymentService.paymentVerification(req, res)
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "WebHook req send successfully",
        data: result
    })
})

export const paymentController = {
    paymentVerification
}