import { AppointmentStatus, PaymentStatus, Prisma } from "@prisma/client"
import { TUserJwtPayload } from "../../types"
import { prisma } from "../../utils/prisma"
import { AppError } from "../../utils/AppError"
import httpStatus from "http-status"
import { IPaginationParameters, normalizeQueryParams } from "../../helper/normalizeQueryParams"

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

const getAllReviews = async (
    filters: any,
    options: Partial<IPaginationParameters>,
) => {
    const { take, page, skip } = normalizeQueryParams(options);
    const { patientEmail, doctorEmail } = filters;
    const andConditions = [];

    if (patientEmail) {
        andConditions.push({
            patient: {
                email: patientEmail
            }
        })
    }

    if (doctorEmail) {
        andConditions.push({
            doctor: {
                email: doctorEmail
            }
        })
    }

    const whereConditions: Prisma.ReviewWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

    const result = await prisma.review.findMany({
        where: whereConditions,
        skip,
        take,
        orderBy:
            options.sortBy && options.sortOrder
                ? { [options.sortBy]: options.sortOrder }
                : {
                    createdAt: 'desc',
                },
        include: {
            doctor: true,
            patient: true,
        },
    });
    const total = await prisma.review.count({
        where: whereConditions,
    });

    return {
        meta: {
            total,
            page,
            limit: take,
        },
        data: result,
    };
};

export const reviewService = {
    createReview,
    getAllReviews
}