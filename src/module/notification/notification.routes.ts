import { Request, Response, Router } from "express";
import { Role } from "@prisma/client";
import httpStatus from "http-status";
import { checkAuth } from "../../middlewares/CheckAuth";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { notificationBus, notificationService } from "./notification.service";

const router = Router();
const anyRole = checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT);

router.get(
  "/",
  anyRole,
  catchAsync(async (req: Request, res: Response) => {
    const result = await notificationService.list(req.user.email, req.query);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Notifications retrieved successfully",
      meta: result.meta,
      data: result.data,
    });
  })
);

router.get(
  "/unread-count",
  anyRole,
  catchAsync(async (req: Request, res: Response) => {
    const count = await notificationService.unreadCount(req.user.email);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Unread count", data: { count } });
  })
);

router.patch(
  "/read-all",
  anyRole,
  catchAsync(async (req: Request, res: Response) => {
    const data = await notificationService.markAllRead(req.user.email);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "All notifications marked as read", data });
  })
);

router.patch(
  "/:id/read",
  anyRole,
  catchAsync(async (req: Request, res: Response) => {
    const data = await notificationService.markRead(req.user.email, req.params.id);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Notification marked as read", data });
  })
);

/** Server-Sent Events stream of new notifications for the current user. */
router.get("/stream", anyRole, (req: Request, res: Response) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);

  const channel = `user:${req.user.email}`;
  const onNotification = (n: unknown) => res.write(`event: notification\ndata: ${JSON.stringify(n)}\n\n`);
  notificationBus.on(channel, onNotification);
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    notificationBus.off(channel, onNotification);
  });
});

export const notificationRoutes = router;
