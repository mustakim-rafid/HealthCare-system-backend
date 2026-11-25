import { Response } from "express";

type TMeta = { page: number; limit: number; total: number; [k: string]: unknown };

/** Consistent envelope: { success, message, meta?, data } */
const sendResponse = <T>(
  res: Response,
  jsonData: {
    statusCode: number;
    success: boolean;
    message: string;
    meta?: TMeta;
    data: T | null | undefined;
  }
) => {
  res.status(jsonData.statusCode).json({
    success: jsonData.success,
    message: jsonData.message,
    meta: jsonData.meta ?? undefined,
    data: jsonData.data ?? null,
  });
};

export default sendResponse;
