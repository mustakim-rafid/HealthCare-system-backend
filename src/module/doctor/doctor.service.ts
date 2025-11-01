import { Prisma } from "@prisma/client";
import {
  IPaginationParameters,
  normalizeQueryParams,
} from "../../helper/normalizeQueryParams";
import { doctorSearchableFields } from "./doctor.constants";
import { prisma } from "../../utils/prisma";
import { TUserJwtPayload } from "../../types";
import { IUpdateDoctorPayload } from "./doctor.interface";

const getDoctorById = async (id: string) => {
  const data = await prisma.doctor.findUniqueOrThrow({
    where: {
      id
    },
    include: {
      doctorSpeciality: {
        include: {
          speciality: true
        }
      },
      doctorSchedule: {
        include: {
          schedule: true
        }
      }
    },
  })

  return data
}

const getAllDoctors = async (
  filters: any,
  options: Partial<IPaginationParameters>
) => {
  const { page, skip, sortBy, sortOrder, take } = normalizeQueryParams(options);
  const { searchTerm, ...doctorFilters } = filters;

  const andConditions: Prisma.DoctorWhereInput[] = [];

  if (searchTerm && searchTerm.length > 0) {
    andConditions.push({
      OR: doctorSearchableFields.map((field) => ({
        [field]: {
          contains: searchTerm,
          mode: "insensitive",
        },
      })),
    });
  }

  if (Object.keys(doctorFilters).length > 0) {
    andConditions.push({
      AND: Object.keys(doctorFilters).map((field) =>
        field === "doctorSpeciality"
          ? {
              doctorSpeciality: {
                some: {
                  speciality: {
                    title: doctorFilters["doctorSpeciality"],
                  },
                },
              },
            }
          : {
            [field]: doctorFilters[field]
          }
      ),
    });
  }

  const whereCondition =
    andConditions.length > 0
      ? {
          AND: andConditions,
        }
      : {};

  const data = await prisma.doctor.findMany({
    take,
    skip,
    orderBy: {
      [sortBy]: sortOrder,
    },
    where: whereCondition,
    include: {
      doctorSpeciality: {
        include: {
          speciality: true,
        },
      },
    },
  });

  const total = await prisma.doctor.count({
    where: whereCondition,
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

const updateDoctor = async (payload: IUpdateDoctorPayload, user: TUserJwtPayload) => {
    const doctorInfo = await prisma.doctor.findUniqueOrThrow({
        where: {
            email: user.email
        }
    })

    const result = await prisma.$transaction(async (tnx) => {

        if (payload.specialities && payload.specialities.length > 0) {
            for(const speciality of payload.specialities) {
                if (speciality.deleteFlag) {
                    await tnx.doctorSpeciality.deleteMany({
                        where: {
                            doctorId: doctorInfo.id,
                            specialityId: speciality.specialityId
                        }
                    })
                } else {
                    await tnx.doctorSpeciality.create({
                        data: {
                            doctorId: doctorInfo.id,
                            specialityId: speciality.specialityId,
                        }
                    })
                }
            }
        }

        const {specialities, ...updateableFields} = payload

        return await prisma.doctor.update({
            where: {
                email: user.email
            },
            data: updateableFields
        })
    })

    return result
}

export const doctorService = {
  getAllDoctors,
  updateDoctor,
  getDoctorById,
};
