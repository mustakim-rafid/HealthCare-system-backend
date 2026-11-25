import config from "../config";
import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { Role } from "@prisma/client";
import { logger } from "../utils/logger";

/**
 * Idempotent: creates the super admin from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD
 * only if it does not exist yet. It never overwrites an existing account, so a
 * password changed through the app is preserved across restarts.
 */
export const seedAdmin = async () => {
  const { email, password } = config.super_admin;
  if (!email || !password) {
    logger.warn("SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set, skipping admin seed");
    return;
  }
  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return;

    const hashedPassword = await bcrypt.hash(password, Number(config.bcrypt_salt_round));
    await prisma.$transaction(async (tnx) => {
      await tnx.user.create({ data: { email, password: hashedPassword, role: Role.ADMIN, needChangePassword: false } });
      await tnx.admin.create({ data: { email, name: "Super admin" } });
    });
    logger.info("Super admin created", { email });
  } catch (error) {
    logger.error("Failed to seed admin user", { err: error as Error });
  }
};
