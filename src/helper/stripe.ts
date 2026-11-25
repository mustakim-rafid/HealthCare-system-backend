import Stripe from "stripe";
import httpStatus from "http-status";
import config from "../config";
import { AppError } from "../utils/AppError";

/** Lazily created so the API still boots (and non-payment features work) without Stripe keys. */
let client: Stripe | null = null;

export const isStripeConfigured = () => Boolean(config.stripe_secret_key);

export const getStripe = (): Stripe => {
  if (!config.stripe_secret_key) {
    throw new AppError(httpStatus.SERVICE_UNAVAILABLE, "Online payment is not configured on the server");
  }
  if (!client) client = new Stripe(config.stripe_secret_key);
  return client;
};
