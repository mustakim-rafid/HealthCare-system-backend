import { CookieOptions, Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { authService } from "./auth.service";
import { extractToken } from "../../middlewares/CheckAuth";

const baseCookie: CookieOptions = { secure: true, httpOnly: true, sameSite: "none", path: "/" };
const ACCESS_MAX_AGE = 1000 * 60 * 60; // 1h
const REFRESH_MAX_AGE = 1000 * 60 * 60 * 24 * 10; // 10d

const setAuthCookies = (res: Response, tokens: { accessToken: string; refreshToken?: string }) => {
  res.cookie("accessToken", tokens.accessToken, { ...baseCookie, maxAge: ACCESS_MAX_AGE });
  if (tokens.refreshToken) res.cookie("refreshToken", tokens.refreshToken, { ...baseCookie, maxAge: REFRESH_MAX_AGE });
};

const login = catchAsync(async (req: Request, res: Response) => {
  const data = await authService.login(req.body);
  setAuthCookies(res, data);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "User logged in successfully",
    success: true,
    data: { needChangePassword: data.needChangePassword },
  });
});

const logout = catchAsync(async (_req: Request, res: Response) => {
  res.clearCookie("accessToken", baseCookie);
  res.clearCookie("refreshToken", baseCookie);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Logged out", data: null });
});

const getMe = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.getMe(extractToken(req) ?? "");
  sendResponse(res, { statusCode: httpStatus.OK, message: "User's details fetched successfully", success: true, data: result });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.refreshToken(req.cookies?.refreshToken ?? req.body?.refreshToken);
  setAuthCookies(res, { accessToken: result.accessToken });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Token refreshed successfully",
    success: true,
    data: { needPasswordChange: result.needPasswordChange },
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const tokens = await authService.changePassword(req.user, req.body.oldPassword, req.body.newPassword);
  setAuthCookies(res, tokens);
  sendResponse(res, { statusCode: httpStatus.OK, message: "Password changed successfully", success: true, data: null });
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  await authService.forgotPassword(req.body.email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "If an account exists for that email, a reset link has been sent.",
    data: null,
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.token, req.body.password);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Password updated. You can now log in.", data: null });
});

export const authController = { login, logout, getMe, refreshToken, changePassword, forgotPassword, resetPassword };
