import { NextFunction, Request, Response } from "express";
import { ZodObject } from "zod";

export const userZodValidator = (schema: ZodObject) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        req.body = await schema.parseAsync(JSON.parse(req.body.user))
        next()
    } catch (error) {
        next(error)
    }
} 