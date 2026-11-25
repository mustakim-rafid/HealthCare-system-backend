import { Role, Status } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import jwt from "jsonwebtoken";
import config from "../config";
import { AppError } from "../utils/AppError";
import { TUserJwtPayload } from "../types";
import { prisma } from "../utils/prisma";

/** Reads the access token from the httpOnly cookie (or a Bearer header for API clients). */
export const extractToken = (req: Request): string | undefined => {
  const cookieToken = req.cookies?.accessToken;
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
};

export const checkAuth =
  (...roles: Role[]) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = extractToken(req);
      if (!token) throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");

      const decoded = jwt.verify(token, config.access_token_secret) as TUserJwtPayload;

      // Make sure the account still exists and is active (blocked/deleted users lose access immediately)
      const user = await prisma.user.findUnique({
        where: { email: decoded.email },
        select: { status: true, role: true, passwordChangedAt: true },
      });
      if (!user || user.status !== Status.ACTIVE) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Account is not active");
      }
      // Tokens issued before a password change/reset are no longer valid
      if (user.passwordChangedAt && decoded.iat && decoded.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Password changed, please log in again");
      }
      if (roles.length && !roles.includes(user.role)) {
        throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to perform this action");
      }

      req.user = { ...decoded, role: user.role };
      next();
    } catch (error) {
      next(error);
    }
  };
