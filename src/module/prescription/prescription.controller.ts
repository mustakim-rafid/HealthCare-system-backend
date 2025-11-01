import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { prescriptionService } from "./prescription.service";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status"

const createPrescription = catchAsync(async (req: Request, res: Response) => {
  const result = await prescriptionService.createPrescription(req.user, req.body)
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: "Prescription created successfully",
    success: true,
    data: result,
  });
});

export const prescriptionController = {
    createPrescription
}