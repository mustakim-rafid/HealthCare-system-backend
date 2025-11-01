import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../../helper/stripe";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";
import config from "../../config";
import { prisma } from "../../utils/prisma";
import { PaymentStatus } from "@prisma/client";

const paymentVerification = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripe_webhook_secret as string
    );
  } catch (err: any) {
    console.error("⚠️ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;

    const appointmentId = session.metadata?.appointmentId;
    const paymentId = session.metadata?.paymentId;

    await prisma.appointment.update({
      where: {
        id: appointmentId
      },
      data: {
        paymentStatus: session.payment_status === "paid" ? PaymentStatus.PAID : PaymentStatus.UNPAID
      }
    })

    await prisma.payment.update({
      where: {
        id: paymentId
      },
      data: {
        paymentStatus: session.payment_status === "paid" ? PaymentStatus.PAID : PaymentStatus.UNPAID,
        paymentGatewayData: session
      }
    })

    return session.payment_status;
  } else if (event.type === "checkout.session.async_payment_failed") {
    console.error("Payment failed");
    throw new AppError(httpStatus.CONFLICT, "Payment failed");
  }
};

export const paymentService = {
  paymentVerification,
};
