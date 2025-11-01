import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { doctorScheduleService } from "./doctorSchedule.service";
import httpStatus from "http-status"

const createDoctorSchedule = catchAsync(async (req: Request, res: Response) => {
  const result = await doctorScheduleService.createDoctorSchedule(req.body.scheduleIds, req.user);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: "Doctor schedule created successfully",
    success: true,
    data: result,
  });
});

export const doctorScheduleController = {
  createDoctorSchedule
}