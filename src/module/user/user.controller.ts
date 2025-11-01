import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { userService } from "./user.service";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status"
import { pick } from "../../helper/pick";
import { paginationParameters, queryParameters } from "./user.constants";
import { IPaginationParameters } from "../../helper/normalizeQueryParams";

const createAdmin = catchAsync(async (req: Request, res: Response) => {
    const data = await userService.createAdmin(req)
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        message: "Admin created successfully",
        success: true,
        data
    })
})

const createPatient = catchAsync(async (req: Request, res: Response) => {
    const data = await userService.createPatient(req)
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        message: "Patient created successfully",
        success: true,
        data
    })
})

const createDoctor = catchAsync(async (req: Request, res: Response) => {
    const data = await userService.createDoctor(req)
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        message: "Doctor created successfully",
        success: true,
        data
    })
})

const getAllUsersFromDB = catchAsync(async (req: Request, res: Response) => {
    const paginations = pick(req.query, paginationParameters)
    const filters = pick(req.query, queryParameters)
    const data = await userService.getAllUsersFromDB(paginations, filters)
    sendResponse(res, {
        statusCode: httpStatus.OK,
        message: "Users retrieved successfully",
        success: true,
        meta: {
            ...data.meta
        },
        data: data.result
    })
})

const getProfileData = catchAsync(async (req: Request, res: Response) => {
    const result = await userService.getProfileData(req.user)
        sendResponse(res, {
        statusCode: httpStatus.OK,
        message: "Profile data fetched successfully",
        success: true,
        data: result
    })
})

export const userController = {
    createAdmin,
    createPatient,
    createDoctor,
    getAllUsersFromDB,
    getProfileData
}