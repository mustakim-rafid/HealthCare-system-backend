import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import { authService } from "./auth.service";
import httpStatus from "http-status";
import sendResponse from "../../utils/sendResponse";

const login = catchAsync(async (req: Request, res: Response) => {
  const data = await authService.login(req.body);
  res.cookie("accessToken", data.accessToken, {
    secure: true,
    httpOnly: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60,
  });
  res.cookie("refreshToken", data.refreshToken, {
    secure: true,
    httpOnly: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 10,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "User logged in successfully",
    success: true,
    data: {
      needChangePassword: data.needChangePassword,
    },
  });
});

const getMe = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies.accessToken;
  const result = await authService.getMe(token);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "User's details fetched successfully",
    success: true,
    data: result,
  });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies.refreshToken;
  const result = await authService.refreshToken(token);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Token refreshed successfully",
    success: true,
    data: result,
  });
});

export const authController = {
  login,
  getMe,
  refreshToken
};
