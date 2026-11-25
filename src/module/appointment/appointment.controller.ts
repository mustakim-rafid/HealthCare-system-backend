import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { appointmentService } from "./appointment.service";

const ok = (res: Response, message: string, data: unknown, statusCode: number = httpStatus.OK) =>
  sendResponse(res, { statusCode, success: true, message, data });

const createAppointment = catchAsync(async (req: Request, res: Response) => {
  const result = await appointmentService.createAppointment(req.body, req.user);
  ok(res, "Slot reserved. Complete the payment to confirm your booking.", result, httpStatus.CREATED);
});

const createAppointmentWithPayLater = catchAsync(async (req: Request, res: Response) => {
  const result = await appointmentService.createAppointmentWithPayLater(req.user, req.body);
  ok(res, "Slot reserved. Complete the payment to confirm your booking.", result, httpStatus.CREATED);
});

const list = catchAsync(async (req: Request, res: Response) => {
  const result = await appointmentService.listAppointments(req.query as Record<string, unknown>, req.user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Appointments retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

const getById = catchAsync(async (req: Request, res: Response) => {
  ok(res, "Appointment retrieved successfully", await appointmentService.getAppointmentById(req.params.id, req.user));
});

const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await appointmentService.updateAppointmentStatus(req.params.id, req.body.status, req.user, req.body.reason);
  ok(res, "Appointment status updated successfully", result);
});

const cancel = catchAsync(async (req: Request, res: Response) => {
  ok(res, "Appointment cancelled", await appointmentService.cancelAppointment(req.params.id, req.user, req.body?.reason));
});

const setMeetLink = catchAsync(async (req: Request, res: Response) => {
  ok(res, "Meet link shared with the patient", await appointmentService.setMeetLink(req.params.id, req.body.meetLink, req.user));
});

const postpone = catchAsync(async (req: Request, res: Response) => {
  ok(res, "Appointment postponed and patient notified", await appointmentService.postponeAppointment(req.params.id, req.body, req.user));
});

const respondPostpone = catchAsync(async (req: Request, res: Response) => {
  const result = await appointmentService.respondToPostponement(req.params.id, req.body.action, req.user);
  ok(res, req.body.action === "accept" ? "New time confirmed" : "Appointment cancelled", result);
});

const listMessages = catchAsync(async (req: Request, res: Response) => {
  ok(res, "Messages retrieved", await appointmentService.listMessages(req.params.id, req.user));
});

const createMessage = catchAsync(async (req: Request, res: Response) => {
  ok(res, "Message sent", await appointmentService.createMessage(req.params.id, req.body.body, req.user), httpStatus.CREATED);
});

export const appointmentController = {
  createAppointment,
  createAppointmentWithPayLater,
  list,
  getById,
  updateStatus,
  cancel,
  setMeetLink,
  postpone,
  respondPostpone,
  listMessages,
  createMessage,
};
