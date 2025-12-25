import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { prescriptionService } from "./prescription.service";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { pick } from "../../helper/pick";

const createPrescription = catchAsync(async (req: Request, res: Response) => {
  const result = await prescriptionService.createPrescription(
    req.user,
    req.body
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message: "Prescription created successfully",
    success: true,
    data: result,
  });
});

const patientPrescription = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
    const result = await prescriptionService.patientPrescription(
      user,
      options
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Prescription fetched successfully",
      meta: result.meta,
      data: result.data,
    });
  }
);

const getAllFromDB = catchAsync(async (req: Request, res: Response) => {
  const filters = pick(req.query, ["patientEmail", "doctorEmail"]);
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const result = await prescriptionService.getAllFromDB(filters, options);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Prescriptions retrieval successfully",
    meta: result.meta,
    data: result.data,
  });
});

export const prescriptionController = {
  createPrescription,
  getAllFromDB,
  patientPrescription
};
