import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { paymentService } from "./payment.service";
import { AppError } from "../../utils/AppError";

/** Stripe webhook — the body is the raw Buffer (see app.ts). Always answers JSON. */
const stripeWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await paymentService.handleWebhook(req.body as Buffer, req.headers["stripe-signature"] as string);
    res.status(200).json({ received: true, result });
  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ received: false, message: err.message });
    next(err);
  }
};

const createCheckoutSession = catchAsync(async (req: Request, res: Response) => {
  const data = await paymentService.createCheckoutSession(req.params.appointmentId, req.user);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Checkout session created", data });
});

const verifySession = catchAsync(async (req: Request, res: Response) => {
  const data = await paymentService.verifySession(String(req.body?.sessionId ?? ""), req.user);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Payment verified", data });
});

export const paymentController = { stripeWebhook, createCheckoutSession, verifySession };
