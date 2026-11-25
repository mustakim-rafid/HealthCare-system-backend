import { EventEmitter } from "events";
import { NotificationType, Role } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { logger } from "../../utils/logger";
import { sendEmail } from "../../helper/email";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";

/** In-process pub/sub used by the SSE stream (one Node instance; clients fall back to polling). */
export const notificationBus = new EventEmitter();
notificationBus.setMaxListeners(1000);

export type NotifyInput = {
  userEmail: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  appointmentId?: string;
  email?: boolean;
};

/**
 * Creates an in-app notification, pushes it to any open SSE connection and optionally emails it.
 * Never throws: a notification failure must never break the booking/payment flow that triggered it.
 */
export const notify = async (input: NotifyInput) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        userEmail: input.userEmail,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
        appointmentId: input.appointmentId,
      },
    });
    notificationBus.emit(`user:${input.userEmail}`, notification);
    if (input.email) sendEmail(input.userEmail, input.title, input.message, input.link);
    return notification;
  } catch (err) {
    logger.error("Failed to create notification", { type: input.type, err: err as Error });
    return null;
  }
};

/** Notify every active admin (new bookings, refunds needing attention, ...). */
export const notifyAdmins = async (input: Omit<NotifyInput, "userEmail">) => {
  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN, status: "ACTIVE" },
    select: { email: true },
  });
  await Promise.all(admins.map((a) => notify({ ...input, userEmail: a.email, email: false })));
};

const list = async (email: string, query: { page?: unknown; limit?: unknown; unread?: unknown }) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const where = { userEmail: email, ...(query.unread === "true" ? { isRead: false } : {}) };
  const [data, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userEmail: email, isRead: false } }),
  ]);
  return { meta: { page, limit, total, unread }, data };
};

const unreadCount = (email: string) => prisma.notification.count({ where: { userEmail: email, isRead: false } });

const markRead = async (email: string, id: string) => {
  const result = await prisma.notification.updateMany({
    where: { id, userEmail: email },
    data: { isRead: true, readAt: new Date() },
  });
  if (result.count === 0) throw new AppError(httpStatus.NOT_FOUND, "Notification not found");
  return { id };
};

const markAllRead = async (email: string) => {
  const result = await prisma.notification.updateMany({
    where: { userEmail: email, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updated: result.count };
};

export const notificationService = { list, unreadCount, markRead, markAllRead };
