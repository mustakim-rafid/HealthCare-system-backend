import { Prisma } from "@prisma/client";
import {
  IPaginationParameters,
  normalizeQueryParams,
} from "../../helper/normalizeQueryParams";
import { doctorSearchableFields } from "./doctor.constants";
import { prisma } from "../../utils/prisma";
import { TUserJwtPayload } from "../../types";
import { IUpdateDoctorPayload } from "./doctor.interface";
import { openai } from "../../helper/open-router";
import { formatAIResponseToJSON } from "../../helper/jsonFormatter";

const getDoctorById = async (id: string) => {
  const data = await prisma.doctor.findUniqueOrThrow({
    where: {
      id,
    },
    include: {
      doctorSpeciality: {
        include: {
          speciality: true,
        },
      },
      doctorSchedule: {
        include: {
          schedule: true,
        },
      },
    },
  });

  return data;
};

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
              [field]: doctorFilters[field],
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

const updateDoctor = async (
  payload: IUpdateDoctorPayload,
  user: TUserJwtPayload
) => {
  const doctorInfo = await prisma.doctor.findUniqueOrThrow({
    where: {
      email: user.email,
    },
  });

  const result = await prisma.$transaction(async (tnx) => {
    if (payload.specialities && payload.specialities.length > 0) {
      for (const speciality of payload.specialities) {
        if (speciality.deleteFlag) {
          await tnx.doctorSpeciality.deleteMany({
            where: {
              doctorId: doctorInfo.id,
              specialityId: speciality.specialityId,
            },
          });
        } else {
          await tnx.doctorSpeciality.create({
            data: {
              doctorId: doctorInfo.id,
              specialityId: speciality.specialityId,
            },
          });
        }
      }
    }

    const { specialities, ...updateableFields } = payload;

    return await prisma.doctor.update({
      where: {
        email: user.email,
      },
      data: updateableFields,
    });
  });

  return result;
};

const doctorSuggestion = async (patientSymptoms: string) => {
  const doctors = await prisma.doctor.findMany({
    where: {
      isDeleted: false,
    },
    include: {
      doctorSpeciality: {
        include: {
          speciality: {
            select: {
              title: true,
            },
          },
        },
      },
    },
  });

  const prompt = `
  You are an AI medical assistant. Based on the patient's symptoms, suggest the most suitable doctor from the list below.
  Always match the symptoms to the doctor's specialization, experience, and provide a short reason for your choice and suggest 2-4 best doctor options.

  --- Patient Symptoms ---
  ${patientSymptoms}

  --- Available Doctors ---
  ${doctors
    .map(
      (doc) =>
        `Doctor: ${doc.name}, Specializations: ${doc.doctorSpeciality.map(
          (val) => val.speciality.title
        )}, Experience: ${doc.experience} years, Qualification: ${
          doc.qualification
        } Average rating: ${doc.averageRating}`
    )
    .join("\n")}

  Return your answer in this JSON array format:
  {
    "suggestedDoctor": "Doctor Name",
    "specialization": "Doctor Specialization",
    "reason": "Why this doctor fits best",
    "rating": "doctor's average rating"
  }[]
  `;

  const completion = await openai.chat.completions.create({
    model: "z-ai/glm-4.5-air:free",
    messages: [
      {
        role: "system",
        content:
          "You are a professional AI medical assistant helping match patients to doctors.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const aiResponse = completion.choices[0].message.content;

  const jsonResponse = formatAIResponseToJSON(aiResponse as string)

  return jsonResponse;
};

export const doctorService = {
  getAllDoctors,
  updateDoctor,
  getDoctorById,
  doctorSuggestion,
};
