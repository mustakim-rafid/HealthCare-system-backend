import { Request, Response } from "express";
import sendResponse from "../../utils/sendResponse";
import catchAsync from "../../utils/catchAsync";
import { doctorService } from "./doctor.service";
import httpStatus from "http-status";
import { pick } from "../../helper/pick";
import { paginationParameters } from "../user/user.constants";

const getDoctorById = catchAsync(async (req: Request, res: Response) => {
  const data = await doctorService.getDoctorById(req.params.id)
    sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Doctor retrieved successfully",
    success: true,
    data
  });
})

const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
  const paginations = pick(req.query, paginationParameters);
  const filters = pick(req.query, ["searchTerm", "email", "name", "gender", "appointmentFee", "doctorSpeciality"]);
  const result = await doctorService.getAllDoctors(filters, paginations);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Doctors information retrieved successfully",
    success: true,
    data: result.data,
    meta: result.meta
  });
});

const updateDoctor = catchAsync(async (req: Request, res: Response) => {
  const result = await doctorService.updateDoctor(req.body, req.user)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Doctor updated successfully",
    success: true,
    data: result
  });
});

export const doctorController = {
  getAllDoctors,
  updateDoctor,
  getDoctorById
};
