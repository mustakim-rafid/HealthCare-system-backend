import { Request } from "express"
import { prisma } from "../../utils/prisma"
import { AppError } from "../../utils/AppError"
import httpStatus from "http-status"
import { fileUploader } from "../../helper/fileUploader"
import fs from "fs"

const createSpeciality = async (req: Request) => {
    const isSpecialityExists = await prisma.speciality.findFirst({
        where: {
            title: req.body.title
        }
    })

    if (isSpecialityExists && isSpecialityExists.id) {
        fs.unlinkSync(req.file?.path as string)
        throw new AppError(httpStatus.CONFLICT, "This speciality already exists")
    }

    const cloudinary = await fileUploader.uploadToCloudinary(req.file as Express.Multer.File)

    if (!cloudinary?.secure_url) {
        throw new AppError(httpStatus.NOT_FOUND, "Cloudinary upload failed")
    }

    const result = await prisma.speciality.create({
        data: {
            title: req.body.title,
            icon: cloudinary.secure_url
        }
    })

    return result
}

const getAllSpecialities = async () => {
    return await prisma.speciality.findMany()
}

export const specialityService = {
    createSpeciality,
    getAllSpecialities
}