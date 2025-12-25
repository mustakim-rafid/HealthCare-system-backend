import { AppointmentStatus, PaymentStatus, Prisma, Role } from "@prisma/client"
import { TUserJwtPayload } from "../../types"
import { prisma } from "../../utils/prisma"
import { AppError } from "../../utils/AppError"
import httpStatus from "http-status"
import { normalizeQueryParams } from "../../helper/normalizeQueryParams"

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

const patientPrescription = async (user: any, options: any) => {
    const { page, skip, sortBy, sortOrder, take } = normalizeQueryParams(options);

    const result = await prisma.prescription.findMany({
        where: {
            patient: {
                email: user?.email
            }
        },
        skip,
        take,
        orderBy: options.sortBy && options.sortOrder
            ? { [options.sortBy]: options.sortOrder }
            : { createdAt: 'desc' },
        include: {
            doctor: true,
            patient: true,
            appointment: true
        }
    });

    const total = await prisma.prescription.count({
        where: {
            patient: {
                email: user?.email
            }
        }
    })

    return {
        meta: {
            total,
            page,
            limit: take
        },
        data: result
    };
};

const getAllFromDB = async (
    filters: any,
    options: any,
) => {
    const { page, skip, sortBy, sortOrder, take } = normalizeQueryParams(options);
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

    const whereConditions: Prisma.PrescriptionWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

    const result = await prisma.prescription.findMany({
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
            appointment: true,
        },
    });
    const total = await prisma.prescription.count({
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

export const prescriptionService = {
    createPrescription,
    getAllFromDB,
    patientPrescription
}