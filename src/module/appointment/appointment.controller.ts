import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { appointmentService } from "./appointment.service";
import httpStatus from "http-status"
import { pick } from "../../helper/pick";
import { paginationParameters } from "../user/user.constants";

const createAppointment = catchAsync(async (req: Request, res: Response) => {
  const result = await appointmentService.createAppointment(req.body, req.user)
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: "Appointment created successfully",
    success: true,
    data: result,
  });
});

const getAllAppointments = catchAsync(async (req: Request, res: Response) => {
  const paginationOptions = pick(req.query, paginationParameters)
  const filters = pick(req.query, ["status", "paymentStatus"])
  const result = await appointmentService.getAllAppointments(filters, paginationOptions, req.user)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Appointments retrieved successfully",
    success: true,
    data: result,
  });
});

const updateAppointmentStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await appointmentService.updateAppointmentStatus(req.params.id, req.body.status, req.user)
    sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Appointment status updated successfully",
    success: true,
    data: result,
  });
})

export const appointmentController = {
  createAppointment,
  getAllAppointments,
  updateAppointmentStatus
}