import { IScheduleFilterQueries, ISchedulePayload } from "../../types/common";
import { addHours, addMinutes } from "date-fns";
import { prisma } from "../../utils/prisma";
import {
  IPaginationParameters,
  normalizeQueryParams,
} from "../../helper/normalizeQueryParams";
import { Prisma, Role } from "@prisma/client";
import { TUserJwtPayload } from "../../types";

const createSchedule = async (payload: ISchedulePayload) => {
  const { startDate, endDate, startTime, endTime } = payload;
  const schedules = [];
  const interval = 30;
  const scheduleStartDate = new Date(startDate);
  const scheduleEndDate = new Date(endDate);

  while (scheduleStartDate <= scheduleEndDate) {
    const startDateTime = addMinutes(
      addHours(scheduleStartDate, Number(startTime.split(":")[0])),
      Number(startTime.split(":")[1])
    );
    const endDateTime = addMinutes(
      addHours(scheduleStartDate, Number(endTime.split(":")[0])),
      Number(endTime.split(":")[1])
    );

    while (startDateTime < endDateTime) {
      const slotStartDateTime = startDateTime;
      const slotEndDateTime = addMinutes(slotStartDateTime, interval);

      const isScheduleExists = await prisma.schedule.findFirst({
        where: {
          startDateTime: slotStartDateTime,
          endDateTime: slotEndDateTime,
        },
      });

      if (isScheduleExists) {
        startDateTime.setMinutes(startDateTime.getMinutes() + interval);
        continue;
      }

      const newSchedule = await prisma.schedule.create({
        data: {
          startDateTime: slotStartDateTime,
          endDateTime: slotEndDateTime,
        },
      });
      schedules.push(newSchedule);

      startDateTime.setMinutes(startDateTime.getMinutes() + interval);
    }

    scheduleStartDate.setDate(scheduleStartDate.getDate() + 1);
  }

  return schedules;
};

const getAllAvailableSchedules = async (
  paginations: Partial<IPaginationParameters>,
  filters: Partial<IScheduleFilterQueries>,
  user: TUserJwtPayload
) => {
  let selectedScheduleIds;
  if (user.role === Role.DOCTOR) {
    const result = await prisma.doctorSchedule.findMany({
      where: {
        doctor: {
          email: user.email,
        },
      },
      select: {
        scheduleId: true,
      },
    });
    selectedScheduleIds = result.map((obj) => obj.scheduleId);
  }

  const { take, skip, page, sortOrder, sortBy } =
    normalizeQueryParams(paginations);
  const { startDateTime: filterStartDateTime, endDateTime: filterEndDateTime } =
    filters;

  const andConditions: Prisma.ScheduleWhereInput[] = [];

  if (filterStartDateTime && filterEndDateTime) {
    andConditions.push({
      startDateTime: {
        gte: filterStartDateTime,
      },
    });
    andConditions.push({
      endDateTime: {
        lte: filterEndDateTime,
      },
    });
  }

  const whereConditions =
    andConditions.length > 0
      ? {
          AND: andConditions,
        }
      : {};

  const data = await prisma.schedule.findMany({
    take,
    skip,
    orderBy: {
      [sortBy]: sortOrder,
    },
    where: {
      ...whereConditions,
      id: {
        notIn: selectedScheduleIds,
      },
    },
  });

  const total = await prisma.schedule.count({
    where: {
      ...whereConditions,
      id: {
        notIn: selectedScheduleIds,
      },
    },
  });

  return {
    meta: {
      limit: take,
      page,
      total,
    },
    data,
  };
};

const deleteScheduleById = async (id: string) => {
  const data = await prisma.schedule.delete({
    where: {
      id
    }
  })

  return data
}

export const scheduleService = {
  createSchedule,
  getAllAvailableSchedules,
  deleteScheduleById
};
