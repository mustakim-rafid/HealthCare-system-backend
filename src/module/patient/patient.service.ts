import { Prisma } from "@prisma/client"
import { IPaginationParameters, normalizeQueryParams } from "../../helper/normalizeQueryParams"
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

const getAllPatients = async (filters: any, options: Partial<IPaginationParameters>) => {
    const { take, skip, page, sortBy, sortOrder } = normalizeQueryParams(options)
    const { searchTerm, ...filterData } = filters

    const andConditions: Prisma.PaitentWhereInput[] = []
    
    if (searchTerm && searchTerm.length > 0) {
        andConditions.push({
            OR: ["name", "email"].map(item => ({
                [item]: {
                    contains: searchTerm,
                    mode: "insensitive"
                }
            }))
        })
    }

    if (Object.keys(filterData).length > 0) {
        andConditions.push({
            AND: Object.keys(filterData).map(key => ({
                [key]: filterData[key]
            }))
        })
    }

    const whereConditions: Prisma.PaitentWhereInput = andConditions.length > 0 ? {
        AND: andConditions
    } : {}

    const result = await prisma.paitent.findMany({
        take,
        skip,
        orderBy: {
            [sortBy]: sortOrder
        },
        where: whereConditions,
        include: {
            patientHealthData: true,
            appointment: true
        }
    })

    return result
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
    updatePatient,
    getAllPatients
}