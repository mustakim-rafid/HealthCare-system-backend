import { Prisma, Role } from "@prisma/client";
import { prisma, TxClient } from "../utils/prisma";
import { logger } from "../utils/logger";

type AuditInput = {
  actor?: { email?: string; role?: Role } | null;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
};

/** Records a sensitive action. Inside a transaction pass `tx`; otherwise it never throws. */
export const audit = async (input: AuditInput, tx?: TxClient) => {
  const data = {
    actorEmail: input.actor?.email ?? null,
    actorRole: input.actor?.role ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    metadata: input.metadata,
  };
  if (tx) return tx.auditLog.create({ data });
  try {
    await prisma.auditLog.create({ data });
  } catch (err) {
    logger.error("Failed to write audit log", { action: input.action, err: err as Error });
  }
};
