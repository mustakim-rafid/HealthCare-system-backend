import { TUserJwtPayload } from "../../types"
import { prisma } from "../../utils/prisma"

const createDoctorSchedule = async (scheduleIds: string[], user: TUserJwtPayload) => {
    const doctor = await prisma.doctor.findUniqueOrThrow({
        where: {
            email: user.email
        }
    })

    const data = scheduleIds.map((scheduleId) => ({
        scheduleId,
        doctorId: doctor.id
    }))

    const result = await prisma.doctorSchedule.createMany({
        data
    })

    return result
}

export const doctorScheduleService = {
    createDoctorSchedule
}