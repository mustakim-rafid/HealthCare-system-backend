import { AppointmentStatus, Prisma, Role } from "@prisma/client";
import { IPaginationParameters, normalizeQueryParams } from "../../helper/normalizeQueryParams";
import { stripe } from "../../helper/stripe";
import { TUserJwtPayload } from "../../types";
import { prisma } from "../../utils/prisma";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status"

const createAppointment = async (
  payload: { doctorId: string; scheduleId: string },
  user: TUserJwtPayload
) => {
  const doctor = await prisma.doctor.findUniqueOrThrow({
    where: {
      id: payload.doctorId,
    },
  });
  await prisma.doctorSchedule.findUniqueOrThrow({
    where: {
      scheduleId_doctorId: {
        scheduleId: payload.scheduleId,
        doctorId: payload.doctorId,
      },
      isBooked: false,
    },
  });
  const patient = await prisma.paitent.findUniqueOrThrow({
    where: {
      email: user.email,
    },
  });
  const videoCallingId = uuidv4();
  return await prisma.$transaction(async (tnx) => {
    const appointment = await tnx.appointment.create({
      data: {
        doctorId: doctor.id,
        scheduleId: payload.scheduleId,
        patientId: patient.id,
        videoCallingId,
      },
    });
    const transactionId = uuidv4();
    const payment = await tnx.payment.create({
      data: {
        appointmentId: appointment.id,
        amount: doctor.appointmentFee,
        transactionId,
      },
    });
    await tnx.doctorSchedule.update({
      where: {
        scheduleId_doctorId: {
          doctorId: payload.doctorId,
          scheduleId: payload.scheduleId,
        },
      },
      data: {
        isBooked: true,
      },
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: patient.email,
      line_items: [
        {
          price_data: {
            currency: "bdt",
            product_data: { name: `Appointment with ${doctor.name}` },
            unit_amount: doctor.appointmentFee * 100,
          },
          quantity: 1
        },
      ],
      metadata: {
        appointmentId: appointment.id,
        paymentId: payment.id
      },
      mode: "payment",
      success_url: "https://web.programming-hero.com",
      cancel_url: "https://nextjs.org",
    });

    return {
        paymentUrl: session.url
    };
  });
};

const getAllAppointments = async (filters: any, options: Partial<IPaginationParameters>, user: TUserJwtPayload) => {
  const { page, skip, sortBy, sortOrder, take } = normalizeQueryParams(options)

  const andConditions: Prisma.AppointmentWhereInput[] = []

  if (Object.keys(filters).length > 0) {
    andConditions.push({
      AND: Object.keys(filters).map((field) => ({
        [field]: filters[field]
      }))
    })
  }

  if (user.role === Role.DOCTOR) {
    andConditions.push({
      doctor: {
        email: user.email
      }
    })
  } else if(user.role === Role.PATIENT) {
    andConditions.push({
      patient: {
        email: user.email
      }
    })
  }

  const whereCondition: Prisma.AppointmentWhereInput = andConditions.length > 0 ? {
    AND: andConditions
  } : {}

  const appointments = await prisma.appointment.findMany({
    take,
    skip,
    orderBy: {
      [sortBy]: sortOrder
    },
    where: whereCondition,
    include: user.role === Role.DOCTOR ? {
      patient: true,
      schedule: true
    } : user.role === Role.PATIENT ? {
      doctor: true,
      schedule: true
    } : {
      patient: true,
      doctor: true,
      schedule: true
    }
  })
}

const updateAppointmentStatus = async (id: string, status: AppointmentStatus, user: TUserJwtPayload) => {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: {
      id
    },
    include: {
      doctor: true
    }
  })
  if (user.role === Role.DOCTOR) {
    if (!(user.email === appointment.doctor.email)) {
      throw new AppError(httpStatus.BAD_REQUEST, "This is not your appointment")
    }
  }
  const result = await prisma.appointment.update({
    where: {
      id
    },
    data: {
      status
    }
  })

  return result
}
 
export const appointmentService = {
  createAppointment,
  getAllAppointments,
  updateAppointmentStatus
};
