import { AppointmentStatus, Prisma, Role } from "@prisma/client";
import {
  IPaginationParameters,
  normalizeQueryParams,
} from "../../helper/normalizeQueryParams";
import { stripe } from "../../helper/stripe";
import { TUserJwtPayload } from "../../types";
import { prisma } from "../../utils/prisma";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";

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
          quantity: 1,
        },
      ],
      metadata: {
        appointmentId: appointment.id,
        paymentId: payment.id,
      },
      mode: "payment",
      success_url: "https://web.programming-hero.com",
      cancel_url: "https://nextjs.org",
    });

    return {
      paymentUrl: session.url,
    };
  });
};

const getAllAppointments = async (
  filters: any,
  options: Partial<IPaginationParameters>,
  user: TUserJwtPayload
) => {
  const { page, skip, sortBy, sortOrder, take } = normalizeQueryParams(options);

  const andConditions: Prisma.AppointmentWhereInput[] = [];

  if (Object.keys(filters).length > 0) {
    andConditions.push({
      AND: Object.keys(filters).map((field) => ({
        [field]: filters[field],
      })),
    });
  }

  if (user.role === Role.DOCTOR) {
    andConditions.push({
      doctor: {
        email: user.email,
      },
    });
  } else if (user.role === Role.PATIENT) {
    andConditions.push({
      patient: {
        email: user.email,
      },
    });
  }

  const whereCondition: Prisma.AppointmentWhereInput =
    andConditions.length > 0
      ? {
          AND: andConditions,
        }
      : {};

  const appointments = await prisma.appointment.findMany({
    take,
    skip,
    orderBy: {
      [sortBy]: sortOrder,
    },
    where: whereCondition,
    include:
      user.role === Role.DOCTOR
        ? {
            patient: true,
            schedule: true,
          }
        : user.role === Role.PATIENT
        ? {
            doctor: true,
            schedule: true,
          }
        : {
            patient: true,
            doctor: true,
            schedule: true,
          },
  });
};

const updateAppointmentStatus = async (
  id: string,
  status: AppointmentStatus,
  user: TUserJwtPayload
) => {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: {
      id,
    },
    include: {
      doctor: true,
    },
  });
  if (user.role === Role.DOCTOR) {
    if (!(user.email === appointment.doctor.email)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This is not your appointment"
      );
    }
  }
  const result = await prisma.appointment.update({
    where: {
      id,
    },
    data: {
      status,
    },
  });

  return result;
};

const getMyAppointment = async (user: any, filters: any, options: any) => {
  const { page, skip, sortBy, sortOrder, take } = normalizeQueryParams(options);
  const { ...filterData } = filters;

  const andConditions: Prisma.AppointmentWhereInput[] = [];

  if (user?.role === Role.PATIENT) {
    andConditions.push({
      patient: {
        email: user?.email,
      },
    });
  } else if (user?.role === Role.DOCTOR) {
    andConditions.push({
      doctor: {
        email: user?.email,
      },
    });
  }

  if (Object.keys(filterData).length > 0) {
    const filterConditions = Object.keys(filterData).map((key) => ({
      [key]: {
        equals: (filterData as any)[key],
      },
    }));

    andConditions.push(...filterConditions);
  }

  const whereConditions: Prisma.AppointmentWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.appointment.findMany({
    where: whereConditions,
    skip,
    take,
    orderBy: {
      [sortBy]: sortOrder,
    },
    include:
      user?.role === Role.DOCTOR
        ? {
            patient: true,
            schedule: true,
            prescription: true,
            Review: true,
            payment: true,
            doctor: {
              include: {
                doctorSpeciality: {
                  include: {
                    speciality: true,
                  },
                },
              },
            },
          }
        : {
            doctor: {
              include: {
                doctorSpeciality: {
                  include: {
                    speciality: true,
                  },
                },
              },
            },
            schedule: true,
            prescription: true,
            Review: true,
            payment: true,
            patient: true,
          },
  });

  const total = await prisma.appointment.count({
    where: whereConditions,
  });

  return {
    meta: {
      total,
      limit: take,
      page,
    },
    data: result,
  };
};

const createAppointmentWithPayLater = async (user: any, payload: any) => {
  const patientData = await prisma.paitent.findUniqueOrThrow({
    where: {
      email: user?.email,
    },
  });

  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: {
      id: payload.doctorId,
      isDeleted: false,
    },
  });

  await prisma.doctorSchedule.findFirstOrThrow({
    where: {
      doctorId: doctorData.id,
      scheduleId: payload.scheduleId,
      isBooked: false,
    },
  });

  const videoCallingId = uuidv4();

  const result = await prisma.$transaction(async (tnx) => {
    const appointmentData = await tnx.appointment.create({
      data: {
        patientId: patientData.id,
        doctorId: doctorData.id,
        scheduleId: payload.scheduleId,
        videoCallingId,
      },
      include: {
        patient: true,
        doctor: true,
        schedule: true,
      },
    });

    await tnx.doctorSchedule.updateMany({
      where: {
        doctorId: doctorData.id,
        scheduleId: payload.scheduleId,
      },
      data: {
        isBooked: true,
      },
    });

    const transactionId = uuidv4();

    await tnx.payment.create({
      data: {
        appointmentId: appointmentData.id,
        amount: doctorData.appointmentFee,
        transactionId,
      },
    });

    return appointmentData;
  });

  return result;
};

export const appointmentService = {
  createAppointment,
  getAllAppointments,
  updateAppointmentStatus,
  getMyAppointment,
  createAppointmentWithPayLater
};
