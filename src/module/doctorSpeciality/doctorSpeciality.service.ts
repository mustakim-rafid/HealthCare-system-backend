import { TUserJwtPayload } from "../../types"
import { AppError } from "../../utils/AppError"
import { prisma } from "../../utils/prisma"
import httpStatus from "http-status"

const createDoctorSpeciality = async (specialityId: string, user: TUserJwtPayload) => {
    const isDoctorSpecialityAlreadyExists = await prisma.doctorSpeciality.findFirst({
        where: {
            specialityId,
            doctor: {
                email: user.email
            }
        }
    })

    if (isDoctorSpecialityAlreadyExists) {
        throw new AppError(httpStatus.CONFLICT, "This speciality is already selected")
    }

    const result = await prisma.$transaction(async (tnx) => {
        const doctor = await tnx.doctor.findUniqueOrThrow({
            where: {
                email: user.email
            }
        })

        return await tnx.doctorSpeciality.create({
            data: {
                specialityId,
                doctorId: doctor.id
            }
        })
    })

    return result
}

export const doctorSpecialityService = {
    createDoctorSpeciality
}