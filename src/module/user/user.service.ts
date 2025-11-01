import { Request } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../utils/prisma";
import { fileUploader } from "../../helper/fileUploader";
import {
  IPaginationParameters,
  normalizeQueryParams,
} from "../../helper/normalizeQueryParams";
import { Prisma, Role, Status } from "@prisma/client";
import { searchableFields } from "./user.constants";
import { TUserJwtPayload } from "../../types";

const createAdmin = async (req: Request) => {
  if (req.file) {
    const uploadResponse = await fileUploader.uploadToCloudinary(req.file);
    req.body.admin.profilePhoto = uploadResponse?.secure_url;
  }

  const hashPassword = await bcrypt.hash(req.body.password, 10);

  const result = await prisma.$transaction(async (tnx) => {
    await tnx.user.create({
      data: {
        email: req.body.admin.email,
        password: hashPassword,
        role: req.body.admin?.role || Role.ADMIN
      },
    });

    return await tnx.admin.create({
      data: {
        name: req.body.admin.name,
        email: req.body.admin.email,
        profilePhoto: req.body.admin?.profilePhoto,
        contactNumber: req.body.admin?.contactNumber,
      },
    });
  });

  return result;
};

const createPatient = async (req: Request) => {
  if (req.file) {
    const uploadResponse = await fileUploader.uploadToCloudinary(req.file);
    req.body.patient.profilePhoto = uploadResponse?.secure_url;
  }

  const hashPassword = await bcrypt.hash(req.body.password, 10);

  const result = await prisma.$transaction(async (tnx) => {
    await tnx.user.create({
      data: {
        email: req.body.patient.email,
        password: hashPassword,
      },
    });

    return await tnx.paitent.create({
      data: {
        name: req.body.patient.name,
        email: req.body.patient.email,
        profilePhoto: req.body.patient?.profilePhoto,
        address: req.body.patient?.address,
        contactNumber: req.body.patient?.contactNumber,
      },
    });
  });

  return result;
};

const createDoctor = async (req: Request) => {
  if (req.file) {
    const uploadResponse = await fileUploader.uploadToCloudinary(req.file);
    req.body.doctor.profilePhoto = uploadResponse?.secure_url;
  }

  const hashPassword = await bcrypt.hash(req.body.password, 10);

  const result = await prisma.$transaction(async (tnx) => {
    await tnx.user.create({
      data: {
        email: req.body.doctor.email,
        role: req.body.doctor?.role || Role.DOCTOR,
        password: hashPassword,
      },
    });

    return await tnx.doctor.create({
      data: {
        name: req.body.doctor.name,
        email: req.body.doctor.email,
        profilePhoto: req.body.doctor?.profilePhoto,
        address: req.body.doctor?.address,
        contactNumber: req.body.doctor?.contactNumber,
        appointmentFee: req.body.doctor.appointmentFee,
        currentWorkingPlace: req.body.doctor.currentWorkingPlace,
        designation: req.body.doctor.designation,
        gender: req.body.doctor.gender,
        qualification: req.body.doctor.qualification,
        registrationNumber: req.body.doctor.registrationNumber,
      },
    });
  });

  return result;
};

const getAllUsersFromDB = async (
  paginations: Partial<IPaginationParameters>,
  filters: any
) => {
  const { take, skip, page, sortOrder, sortBy } = normalizeQueryParams(paginations);

  const { searchTerm, ...filterOptions } = filters;

  const filterOptionsPairs = Object.entries(filterOptions);

  const andConditions: Prisma.UserWhereInput[] = [];

  if (searchTerm) {
    andConditions.push({
      OR: searchableFields.map((key) => ({
        [key]: {
          contains: searchTerm,
          mode: "insensitive",
        },
      })),
    });
  }

  if (filterOptionsPairs.length > 0) {
    andConditions.push({
      AND: filterOptionsPairs.map((eachPair) => ({
        [eachPair[0]]: {
            equals: eachPair[1]
        },
      })),
    });
  }

  const whereConditions = andConditions.length > 0 ? {
    AND: andConditions
  } : {}

  const result = await prisma.user.findMany({
    skip,
    take,
    orderBy: {
      [sortBy]: sortOrder,
    },
    where: whereConditions
  });

  const total = await prisma.user.count({
    where: whereConditions
  })

  return {
    meta: {
        limit: take,
        page,
        total
    },
    result
  };
};

const getProfileData = async (user: TUserJwtPayload) => {
  const userData = await prisma.user.findUniqueOrThrow({
    where: {
      email: user.email,
      status: Status.ACTIVE
    },
    select: {
      email: true,
      role: true,
      status: true,
      needChangePassword: true
    }
  })

  let profileData;

  if (user.role === Role.ADMIN) {
    profileData = await prisma.admin.findUniqueOrThrow({
      where: {
        email: user.email,
        isDeleted: false
      }
    })
  } else if (user.role === Role.DOCTOR) {
    profileData = await prisma.doctor.findUniqueOrThrow({
      where: {
        email: user.email,
        isDeleted: false
      }
    })
  } else if (user.role === Role.PATIENT) {
    profileData = await prisma.paitent.findUniqueOrThrow({
      where: {
        email: user.email,
        isDeleted: true
      }
    })
  }

  return {
    ...userData,
    ...profileData
  }
}

export const userService = {
  createAdmin,
  createPatient,
  createDoctor,
  getAllUsersFromDB,
  getProfileData
};
