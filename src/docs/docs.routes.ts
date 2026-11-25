import { Request, Response, Router } from "express";

/**
 * Hand-maintained OpenAPI 3 description of the main endpoints.
 * UI: GET /api/v1/docs   ·   Spec: GET /api/v1/docs/openapi.json
 * Auth: httpOnly `accessToken` cookie (set by /auth/login) or `Authorization: Bearer <token>`.
 */
const ok = { description: "Success — envelope { success, message, meta?, data }" };
const auth = [{ cookieAuth: [] }, { bearerAuth: [] }];
const idParam = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const body = (properties: Record<string, unknown>, required: string[] = []) => ({
  required: true,
  content: { "application/json": { schema: { type: "object", properties, required } } },
});
const op = (tag: string, summary: string, extra: Record<string, unknown> = {}) => ({
  tags: [tag],
  summary,
  responses: { 200: ok, 400: { description: "Validation error" }, 401: { description: "Not logged in" }, 403: { description: "Forbidden" }, 404: { description: "Not found" }, 409: { description: "Conflict (e.g. slot already booked)" } },
  ...extra,
});

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Health Care API",
    version: "2.0.0",
    description:
      "Appointment platform API (Admin / Doctor / Patient). Booking lifecycle: PENDING_PAYMENT → CONFIRMED → (POSTPONED ⇄ CONFIRMED) → INPROGRESS → COMPLETED | NO_SHOW, or CANCELLED. Times are UTC ISO-8601.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "accessToken" },
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  paths: {
    "/auth/login": { post: op("Auth", "Log in (sets httpOnly cookies). Rate limited.", { requestBody: body({ email: { type: "string" }, password: { type: "string" } }, ["email", "password"]) }) },
    "/auth/logout": { post: op("Auth", "Clear auth cookies") },
    "/auth/getme": { get: op("Auth", "Current user", { security: auth }) },
    "/auth/refresh-token": { post: op("Auth", "Issue a new access token from the refresh cookie") },
    "/auth/change-password": { patch: op("Auth", "Change password", { security: auth, requestBody: body({ oldPassword: { type: "string" }, newPassword: { type: "string" } }, ["oldPassword", "newPassword"]) }) },
    "/auth/forgot-password": { post: op("Auth", "Email a reset link (always 200)", { requestBody: body({ email: { type: "string" } }, ["email"]) }) },
    "/auth/reset-password": { post: op("Auth", "Reset password with token", { requestBody: body({ token: { type: "string" }, password: { type: "string" } }, ["token", "password"]) }) },

    "/user/create-patient": { post: op("Users", "Register a patient (multipart: data=<json>, file?)") },
    "/user/create-doctor": { post: op("Users", "Admin: create doctor (multipart)", { security: auth }) },
    "/user/create-admin": { post: op("Users", "Admin: create admin (multipart)", { security: auth }) },
    "/user/profile-data": { get: op("Users", "My profile", { security: auth }) },
    "/user/update-my-profile": { patch: op("Users", "Update my profile (whitelisted fields)", { security: auth }) },

    "/schedule": {
      post: op("Schedules", "Admin: create 30-min slots", { security: auth, requestBody: body({ startDate: { type: "string", example: "2026-12-01" }, endDate: { type: "string" }, startTime: { type: "string", example: "09:00" }, endTime: { type: "string", example: "17:00" }, timezoneOffsetMinutes: { type: "integer" } }, ["startDate", "endDate", "startTime", "endTime"]) }),
      get: op("Schedules", "Admin: all slots · Doctor: future slots not yet picked", { security: auth }),
    },
    "/schedule/{id}": { delete: op("Schedules", "Admin: soft-delete slot (refused if actively booked)", { security: auth, parameters: [idParam] }) },
    "/doctor-schedule": {
      post: op("Schedules", "Doctor: offer slots (overlaps rejected)", { security: auth, requestBody: body({ scheduleIds: { type: "array", items: { type: "string" } } }, ["scheduleIds"]) }),
      get: op("Schedules", "Availability: future unbooked slots (filters: doctorId, date=YYYY-MM-DD, searchTerm)", { security: auth }),
    },
    "/doctor-schedule/my-schedule": { get: op("Schedules", "Doctor: my slots (isBooked, upcoming)", { security: auth }) },

    "/doctor": { get: op("Doctors", "Public doctor directory (searchTerm, doctorSpeciality, gender, page, limit)") },
    "/doctor/{id}": { get: op("Doctors", "Doctor profile with bookable slots", { parameters: [idParam] }) },

    "/appointment": {
      post: op("Bookings", "Patient: hold a slot (PENDING_PAYMENT) and get a Stripe Checkout URL", { security: auth, requestBody: body({ doctorId: { type: "string" }, scheduleId: { type: "string" } }, ["doctorId", "scheduleId"]) }),
      get: op("Bookings", "Role-scoped list (status, paymentStatus, upcoming, past, searchTerm, sortBy=createdAt|startDateTime, page, limit)", { security: auth }),
    },
    "/appointment/{id}": { get: op("Bookings", "Booking details (ownership enforced)", { security: auth, parameters: [idParam] }) },
    "/appointment/{id}/cancel": { post: op("Bookings", "Cancel (patient: before cutoff; refund if paid)", { security: auth, parameters: [idParam], requestBody: body({ reason: { type: "string" } }) }) },
    "/appointment/{id}/update-status": { patch: op("Bookings", "Doctor/Admin: valid transitions only", { security: auth, parameters: [idParam], requestBody: body({ status: { type: "string" } }, ["status"]) }) },
    "/appointment/{id}/meet-link": { patch: op("Bookings", "Doctor: share Google Meet link (confirmed + paid only)", { security: auth, parameters: [idParam], requestBody: body({ meetLink: { type: "string", example: "https://meet.google.com/abc-defg-hij" } }, ["meetLink"]) }) },
    "/appointment/{id}/postpone": { post: op("Bookings", "Doctor: postpone with message and a new slot", { security: auth, parameters: [idParam], requestBody: body({ newScheduleId: { type: "string" }, message: { type: "string" } }, ["newScheduleId", "message"]) }) },
    "/appointment/{id}/postpone/respond": { post: op("Bookings", "Patient: accept new slot or cancel (refund)", { security: auth, parameters: [idParam], requestBody: body({ action: { type: "string", enum: ["accept", "cancel"] } }, ["action"]) }) },
    "/appointment/{id}/messages": {
      get: op("Bookings", "Message history (doctor, patient, admin)", { security: auth, parameters: [idParam] }),
      post: op("Bookings", "Send a message", { security: auth, parameters: [idParam], requestBody: body({ body: { type: "string" } }, ["body"]) }),
    },

    "/payment/checkout/{appointmentId}": { post: op("Payments", "Patient: (re)create Stripe Checkout session for a held booking", { security: auth, parameters: [{ ...idParam, name: "appointmentId" }] }) },
    "/payment/verify": { post: op("Payments", "Patient: server-side verification of a Checkout session (idempotent)", { security: auth, requestBody: body({ sessionId: { type: "string" } }, ["sessionId"]) }) },
    "/payment/webhook": { post: op("Payments", "Stripe webhook (signature verified, idempotent)") },

    "/notification": { get: op("Notifications", "My notifications (page, limit, unread=true)", { security: auth }) },
    "/notification/unread-count": { get: op("Notifications", "Unread count", { security: auth }) },
    "/notification/{id}/read": { patch: op("Notifications", "Mark one as read", { security: auth, parameters: [idParam] }) },
    "/notification/read-all": { patch: op("Notifications", "Mark all as read", { security: auth }) },
    "/notification/stream": { get: op("Notifications", "Server-Sent Events stream", { security: auth }) },

    "/search": { get: op("Search", "Role-scoped grouped search (q, limit)", { security: auth }) },
    "/review": { post: op("Reviews", "Patient: review a completed, paid appointment", { security: auth }), get: op("Reviews", "List reviews") },
    "/meta": { get: op("Dashboard", "Role dashboard statistics", { security: auth }) },
  },
};

const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Health Care API docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/></head>
<body><div id="ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.onload=()=>{SwaggerUIBundle({url:"./docs/openapi.json",dom_id:"#ui"})}</script></body></html>`;

const router = Router();
router.get("/openapi.json", (_req: Request, res: Response) => res.json(openApiSpec));
router.get("/", (_req: Request, res: Response) => {
  // Relaxed CSP only for this page so the Swagger UI assets can load
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https:"
  );
  res.type("html").send(html);
});

export const docsRoutes = router;
