import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import jwt from "jsonwebtoken";
import config from "../config";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const globalErrorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  let statusCode: number = err?.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
  let message: string = err?.message || "Something went wrong!";
  let error: unknown = undefined;

  if (err instanceof AppError) {
    error = err.details;
  } else if (err instanceof ZodError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = err.issues[0]?.message || "Validation error";
    error = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  } else if (err instanceof jwt.TokenExpiredError) {
    statusCode = httpStatus.UNAUTHORIZED;
    message = "Session expired, please log in again";
  } else if (err instanceof jwt.JsonWebTokenError) {
    statusCode = httpStatus.UNAUTHORIZED;
    message = "Invalid session, please log in again";
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      statusCode = httpStatus.CONFLICT;
      message = "A record with these details already exists";
    } else if (err.code === "P2025") {
      statusCode = httpStatus.NOT_FOUND;
      message = "Requested resource was not found";
    } else if (err.code === "P2003") {
      statusCode = httpStatus.BAD_REQUEST;
      message = "Related resource does not exist";
    } else {
      statusCode = httpStatus.BAD_REQUEST;
      message = "Database request failed";
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Invalid request data";
  } else if (err?.type === "entity.too.large") {
    statusCode = httpStatus.REQUEST_ENTITY_TOO_LARGE;
    message = "Request body is too large";
  } else if (err?.type === "entity.parse.failed") {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Malformed JSON body";
  }

  if (statusCode >= 500) {
    logger.error("Unhandled request error", { method: req.method, path: req.originalUrl, err });
    if (config.isProduction) message = "Something went wrong!";
  }

  res.status(statusCode).json({
    success: false,
    message,
    error,
    stack: config.node_env === "development" ? err?.stack : undefined,
  });
};

export default globalErrorHandler;
