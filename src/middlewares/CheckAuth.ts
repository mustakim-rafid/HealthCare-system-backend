import { Role } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import httpStatus from "http-status"
import jwt from "jsonwebtoken"
import getEnvs from "../config"
import { TUserJwtPayload } from "../types";

export const checkAuth = (...roles: Role[]) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.cookies.accessToken
        
        if (!token) {
            throw new AppError(httpStatus.NOT_FOUND, "Token is missing")
        }

        const decodedToken = jwt.verify(token, getEnvs.access_token_secret!)

        if (!roles.includes((decodedToken as TUserJwtPayload).role)) {
            throw new AppError(httpStatus.UNAUTHORIZED, "You are not authorized")
        }
        
        req.user = decodedToken as TUserJwtPayload

        next()
    } catch (error) {
        next(error)
    }
}