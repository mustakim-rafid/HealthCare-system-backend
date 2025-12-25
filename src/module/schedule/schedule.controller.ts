import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { scheduleService } from "./schedule.service";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { pick } from "../../helper/pick";
import { paginationParameters } from "../user/user.constants";

const createSchedule = catchAsync(async (req: Request, res: Response) => {
  const result = await scheduleService.createSchedule(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: "Schedule created successfully",
    success: true,
    data: result,
  });
});

const getAllAvailableSchedules = catchAsync(
  async (req: Request, res: Response) => {
    const paginations = pick(req.query, paginationParameters);
    const filters = pick(req.query, ["startDateTime", "endDateTime"]);
    const result = await scheduleService.getAllAvailableSchedules(paginations, filters, req.user);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: "Schedule retrieved successfully",
      success: true,
      data: result.data,
      meta: {
        ...result.meta
      }
    });
  }
);

const deleteScheduleById = catchAsync(
  async (req: Request, res: Response) => {
    const data = await scheduleService.deleteScheduleById(req.params.id)
    sendResponse(res, {
      statusCode: httpStatus.OK,
      message: "Schedule deleted successfully",
      success: true,
      data
    })
  }
);

const getByIdFromDB = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await scheduleService.getByIdFromDB(id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Schedule retrieval successfully',
        data: result,
    });
});

export const scheduleController = {
  createSchedule,
  getAllAvailableSchedules,
  deleteScheduleById,
  getByIdFromDB
};
