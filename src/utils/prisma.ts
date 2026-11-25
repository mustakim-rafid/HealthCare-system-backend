import { PrismaClient } from "@prisma/client";

/**
 * Password hashes and reset-token hashes are omitted from every query by default,
 * so they can never leak through an API response. Code that genuinely needs them
 * (login, change/reset password) opts back in with `omit: { password: false }`.
 */
export const prisma = new PrismaClient({
  omit: {
    user: { password: true, passwordResetTokenHash: true, passwordResetExpires: true },
  },
});

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
