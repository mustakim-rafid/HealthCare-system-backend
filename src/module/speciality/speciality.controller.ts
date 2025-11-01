import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { specialityService } from "./speciality.service";
import httpStatus from "http-status"

const createSpeciality = catchAsync(async (req: Request, res: Response) => {
  const result = await specialityService.createSpeciality(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: "Speciality created successfully",
    success: true,
    data: result,
  });
});

const getAllSpecialities = catchAsync(async (req: Request, res: Response) => {
  const result = await specialityService.getAllSpecialities()
    sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Specialities retrieved successfully",
    success: true,
    data: result,
  });
});

export const specialityController = {
  createSpeciality,
  getAllSpecialities
}