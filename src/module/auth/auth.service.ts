import crypto from "crypto";
import { Status } from "@prisma/client";
import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import { prisma } from "../../utils/prisma";
import { AppError } from "../../utils/AppError";
import { generateToken, verifyToken } from "../../helper/jwt";
import config from "../../config";
import { TUserJwtPayload } from "../../types";
import { sendEmail, isEmailEnabled } from "../../helper/email";
import { logger } from "../../utils/logger";
import { audit } from "../../helper/audit";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

const issueTokens = (email: string, role: string) => ({
  accessToken: generateToken({ email, role }, config.access_token_secret, config.access_token_expiry),
  refreshToken: generateToken({ email, role }, config.refresh_token_secret, config.refresh_token_expiry),
});

const login = async (payload: { email: string; password: string }) => {
  const user = await prisma.user.findFirst({
    where: { email: { equals: payload.email.trim(), mode: "insensitive" } },
    omit: { password: false },
  });
  // Same message for unknown email and wrong password (no account enumeration)
  const ok = user && user.status === Status.ACTIVE && (await bcrypt.compare(payload.password, user.password));
  if (!user || !ok) throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");

  return { ...issueTokens(user.email, user.role), needChangePassword: user.needChangePassword };
};

const getMe = async (token: string) => {
  if (!token) throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
  const decodedToken = verifyToken(token, config.access_token_secret);
  const user = await prisma.user.findFirst({
    where: { email: decodedToken.email, status: Status.ACTIVE },
    include: { admin: true, doctor: true, patient: true },
  });
  if (!user) throw new AppError(httpStatus.UNAUTHORIZED, "Account is not active");
  const profile = user.admin || user.doctor || user.patient;
  return {
    id: user.id,
    name: profile?.name,
    email: user.email,
    role: user.role,
    status: user.status,
    profilePhoto: profile?.profilePhoto ?? null,
    needPasswordChange: user.needChangePassword,
  };
};

const refreshToken = async (token: string) => {
  if (!token) throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token not found");
  let decoded;
  try {
    decoded = verifyToken(token, config.refresh_token_secret);
  } catch {
    throw new AppError(httpStatus.UNAUTHORIZED, "Session expired, please log in again");
  }
  const user = await prisma.user.findFirst({ where: { email: decoded.email, status: Status.ACTIVE } });
  if (!user) throw new AppError(httpStatus.UNAUTHORIZED, "Account is not active");
  if (user.passwordChangedAt && decoded.iat && decoded.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Password changed, please log in again");
  }
  const accessToken = generateToken({ email: user.email, role: user.role }, config.access_token_secret, config.access_token_expiry);
  return { accessToken, needPasswordChange: user.needChangePassword };
};

const changePassword = async (user: TUserJwtPayload, oldPassword: string, newPassword: string) => {
  const userData = await prisma.user.findFirst({
    where: { email: user.email, status: Status.ACTIVE },
    omit: { password: false },
  });
  if (!userData) throw new AppError(httpStatus.UNAUTHORIZED, "Account is not active");
  if (!(await bcrypt.compare(oldPassword, userData.password))) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Old password is incorrect");
  }
  const password = await bcrypt.hash(newPassword, Number(config.bcrypt_salt_round));
  await prisma.user.update({
    where: { email: user.email },
    data: { password, needChangePassword: false, passwordChangedAt: new Date() },
  });
  await audit({ actor: user, action: "PASSWORD_CHANGED", entity: "User", entityId: userData.id });
  // Return fresh tokens so the current session stays valid after the change
  return issueTokens(userData.email, userData.role);
};

/** Always resolves the same way whether or not the email exists (no account enumeration). */
const forgotPassword = async (email: string) => {
  const user = await prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" }, status: Status.ACTIVE } });
  if (!user) return;
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetTokenHash: sha256(token), passwordResetExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });
  const link = `${config.client_url}/reset-password?token=${token}`;
  if (isEmailEnabled()) {
    sendEmail(user.email, "Reset your Health Care password", "Use the link below to choose a new password. It expires in 30 minutes. If you did not request this, you can ignore this email.", link);
  } else if (!config.isProduction) {
    logger.info("Password reset link (SMTP not configured, dev only)", { email: user.email, link });
  } else {
    logger.warn("Password reset requested but SMTP is not configured", { email: user.email });
  }
};

const resetPassword = async (token: string, newPassword: string) => {
  const user = await prisma.user.findFirst({
    where: { passwordResetTokenHash: sha256(token), passwordResetExpires: { gt: new Date() }, status: Status.ACTIVE },
  });
  if (!user) throw new AppError(httpStatus.BAD_REQUEST, "This reset link is invalid or has expired");
  const password = await bcrypt.hash(newPassword, Number(config.bcrypt_salt_round));
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password,
      needChangePassword: false,
      passwordChangedAt: new Date(),
      passwordResetTokenHash: null,
      passwordResetExpires: null,
    },
  });
  await audit({ actor: { email: user.email, role: user.role }, action: "PASSWORD_RESET", entity: "User", entityId: user.id });
};

export const authService = { login, getMe, refreshToken, changePassword, forgotPassword, resetPassword };
