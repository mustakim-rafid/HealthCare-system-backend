import { Request, Response } from "express";
import { MetaService } from "./meta.service";
import httpStatus from "http-status";
import sendResponse from "../../utils/sendResponse";
import catchAsync from "../../utils/catchAsync";

const fetchDashboardMetaData = catchAsync(async (req: Request, res: Response) => {

    const user = req.user;
    const result = await MetaService.fetchDashboardMetaData(user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Meta data retrival successfully!",
        data: result
    })
});

export const MetaController = {
    fetchDashboardMetaData
}