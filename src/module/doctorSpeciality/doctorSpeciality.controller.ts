import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status"
import { doctorSpecialityService } from "./doctorSpeciality.service";

const createDoctorSpeciality = catchAsync(async (req: Request, res: Response) => {
  const result = await doctorSpecialityService.createDoctorSpeciality(req.body.specialityId, req.user);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: "Doctor speciality created successfully",
    success: true,
    data: result,
  });
});

export const doctorSpecialityController = {
    createDoctorSpeciality
}