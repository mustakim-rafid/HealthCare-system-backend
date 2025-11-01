import { TUserJwtPayload } from "../../types"
import { prisma } from "../../utils/prisma"

const getPatientById = async (id: string) => {
    const patient = await prisma.paitent.findUniqueOrThrow({
        where: {
            id
        }
    })

    return patient
}

const updatePatient = async (user: TUserJwtPayload, payload: any) => {
    const { patientHealthData, medicalReport, ...patientData } = payload

    const patient = await prisma.paitent.findUniqueOrThrow({
        where: {
            email: user.email,
            isDeleted: false
        }
    })

    return await prisma.$transaction(async (tnx) => {
        await tnx.paitent.update({
            where: {
                id: patient.id
            },
            data: {
                ...patientData
            }
        })

        patientHealthData && (await tnx.patientHealthData.upsert({
            where: {
                patientId: patient.id
            },
            update: patientHealthData,
            create: {
                ...patientHealthData,
                patientId: patient.id
            }
        }))

        medicalReport && (await tnx.medicalReport.create({
            data: {
                ...medicalReport,
                patientId: patient.id
            }
        }))

        return tnx.paitent.findUniqueOrThrow({
            where: {
                id: patient.id
            },
            include: {
                patientHealthData: true,
                medicalReport: true
            }
        })
    })
}

export const patientService = {
    getPatientById,
    updatePatient
}