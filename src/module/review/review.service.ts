import { AppointmentStatus, PaymentStatus } from "@prisma/client"
import { TUserJwtPayload } from "../../types"
import { prisma } from "../../utils/prisma"
import { AppError } from "../../utils/AppError"
import httpStatus from "http-status"

const createReview = async (user: TUserJwtPayload, payload: any) => {
    const patientData = await prisma.paitent.findUniqueOrThrow({
        where: {
            email: user.email
        }
    })
    const appointmentData = await prisma.appointment.findUniqueOrThrow({
        where: {
            id: payload.appointmentId,
            status: AppointmentStatus.COMPLETED,
            paymentStatus: PaymentStatus.PAID
        }
    })
    if (patientData.id !== appointmentData.patientId) {
        throw new AppError(httpStatus.BAD_REQUEST, "This is not your appointment")
    }
    return await prisma.$transaction(async (tnx) => {
        const review = await tnx.review.create({
            data: {
                appointmentId: appointmentData.id,
                patientId: appointmentData.patientId,
                doctorId: appointmentData.doctorId,
                rating: payload.rating,
                comment: payload.comment
            }
        })
        const avrgRating = await tnx.review.aggregate({
            _avg: {
                rating: true
            },
            where: {
                doctorId: appointmentData.doctorId
            }
        })
        await tnx.doctor.update({
            where: {
                id: appointmentData.doctorId
            },
            data: {
                averageRating: avrgRating._avg.rating as number
            }
        })
        return review
    })
}

export const reviewService = {
    createReview
}