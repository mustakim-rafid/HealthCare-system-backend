import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { ZodType } from "zod";
import { AppError } from "../utils/AppError";

/** For multipart requests where the JSON payload is sent as a string field (`user` or `data`). */
export const userZodValidator = (schema: ZodType) => async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const raw = req.body?.user ?? req.body?.data;
    if (typeof raw !== "string") throw new AppError(httpStatus.BAD_REQUEST, "Missing request payload");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError(httpStatus.BAD_REQUEST, "Malformed JSON payload");
    }
    req.body = await schema.parseAsync(parsed);
    next();
  } catch (error) {
    next(error);
  }
};
