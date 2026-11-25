import rateLimit from "express-rate-limit";

const base = { standardHeaders: "draft-7" as const, legacyHeaders: false };

export const apiLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  message: { success: false, message: "Too many requests, please try again later" },
});

export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { success: false, message: "Too many attempts, please try again in 15 minutes" },
});

export const searchLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 60,
  message: { success: false, message: "Too many searches, slow down a little" },
});
