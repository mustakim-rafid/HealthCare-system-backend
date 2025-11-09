import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { patientService } from "./patient.service";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status"
import { pick } from "../../helper/pick";

const getPatientById = catchAsync(async (req: Request, res: Response) => {
    const result = await patientService.getPatientById(req.params.id)
    sendResponse(res, {
        statusCode: httpStatus.OK,
        message: "Patient details retrieved successfully",
        success: true,
        data: result
    })
})

const getAllPatients = catchAsync(async (req: Request, res: Response) => {
    const paginationOptions = pick(req.query, ["limit", "page", "sortBy", "sortOrder"])
    const filterOptions = pick(req.query, ["searchTerm", "name", "email", "contactNumber"])

    const result = await patientService.getAllPatients(filterOptions, paginationOptions)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        message: "Patients retrieved successfully",
        success: true,
        data: result
    })
})

const updatePatient = catchAsync(async (req: Request, res: Response) => {
    const result = await patientService.updatePatient(req.user, req.body)
        sendResponse(res, {
        statusCode: httpStatus.OK,
        message: "Patient details updated successfully",
        success: true,
        data: result
    })
})

export const patientController = {
    getPatientById,
    getAllPatients,
    updatePatient
}