import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { doctorScheduleService } from "./doctorSchedule.service";
import httpStatus from "http-status"
import { pick } from "../../helper/pick";

const createDoctorSchedule = catchAsync(async (req: Request, res: Response) => {
  const result = await doctorScheduleService.createDoctorSchedule(req.body.scheduleIds, req.user);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: "Doctor schedule created successfully",
    success: true,
    data: result,
  });
});

const getMySchedule = catchAsync(async (req: Request, res: Response) => {
    const filters = pick(req.query, ['startDate', 'endDate', 'isBooked']);
    const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);

    const user = req.user;
    const result = await doctorScheduleService.getMySchedule(filters, options, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "My Schedule fetched successfully!",
        data: result
    });
});

const deleteFromDB = catchAsync(async (req: Request, res: Response) => {

    const user = req.user;
    const { id } = req.params;
    const result = await doctorScheduleService.deleteFromDB(user, id);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "My Schedule deleted successfully!",
        data: result
    });
});

const getAllFromDB = catchAsync(async (req: Request, res: Response) => {
    const filters = pick(req.query, ['searchTerm', 'isBooked', 'doctorId']);
    const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
    const result = await doctorScheduleService.getAllFromDB(filters, options);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Doctor Schedule retrieval successfully',
        meta: result.meta,
        data: result.data,
    });
});

export const doctorScheduleController = {
  createDoctorSchedule,
  getMySchedule,
  getAllFromDB,
  deleteFromDB
}