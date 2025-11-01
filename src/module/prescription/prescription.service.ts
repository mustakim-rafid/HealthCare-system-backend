import { AppointmentStatus, PaymentStatus, Role } from "@prisma/client"
import { TUserJwtPayload } from "../../types"
import { prisma } from "../../utils/prisma"
import { AppError } from "../../utils/AppError"
import httpStatus from "http-status"

const createPrescription = async (user: TUserJwtPayload, payload: { appointmentId: string, followUpDate: Date, instructions: string }) => {
    const appointmentData = await prisma.appointment.findUniqueOrThrow({
        where: {
            id: payload.appointmentId,
            status: AppointmentStatus.COMPLETED,
            paymentStatus: PaymentStatus.PAID
        },
        include: {
            doctor: true
        }
    })
    if (user.role === Role.DOCTOR) {
        if (!(user.email === appointmentData.doctor.email)) {
            throw new AppError(httpStatus.BAD_REQUEST, "This is not your appointment")
        }
    }
    const prescription = await prisma.prescription.create({
        data: {
            appointmentId: payload.appointmentId,
            patientId: appointmentData.patientId,
            doctorId: appointmentData.doctorId,
            followUpDate: payload.followUpDate,
            instructions: payload.instructions
        }
    })
    return prescription
}

export const prescriptionService = {
    createPrescription
}