import config from "../config"
import bcrypt from "bcryptjs"
import { prisma } from "../utils/prisma"
import { Role } from "@prisma/client"

export const seedAdmin = async () => {
    try {
        const isAdminExists = await prisma.user.findUnique({
            where: {
                email: config.super_admin.email
            }
        })

        if (isAdminExists) {
            console.log("Admin already created")
            return
        }

        const hashedPassword = await bcrypt.hash(config.super_admin.password as string, Number(config.bcrypt_salt_round))

        await prisma.$transaction(async (tnx) => {
            await tnx.user.create({
                data: {
                    email: config.super_admin.email!,
                    password: hashedPassword,
                    role: Role.ADMIN
                }
            })

            await tnx.admin.create({
                data: {
                    email: config.super_admin.email!,
                    name: "Super admin"
                }
            })
        })

        console.log("Admin created successfully")
    } catch (error) {
        console.log("Something went wrong while creating the ADMIN user.", error)
    }
}