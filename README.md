# Health Care — Backend API

REST API for a healthcare appointment platform with three roles — **Admin**, **Doctor**, **Patient**.
Patients find doctors, book a time slot, pay with Stripe, get reminders and join the consultation on Google Meet.

- **Frontend repo:** HealthCare-system-frontend (Next.js)
- **API docs (Swagger UI):** `GET /api/v1/docs` · spec: `GET /api/v1/docs/openapi.json`
- **Health check:** `GET /health`

## Features

| Area | What it does |
| --- | --- |
| Scheduling | Admin creates 30-minute slots in Bangladesh time (`APP_TIMEZONE`), stored as UTC (idempotent, no past slots). Doctors pick slots to offer; overlapping picks are rejected. |
| Booking | Patients see only future, unbooked slots. Booking **holds** the slot (`PENDING_PAYMENT`, 30 min) and opens Stripe Checkout. Double booking is impossible (atomic slot claim + partial unique index); a patient cannot hold two overlapping appointments. |
| Payment | Existing Stripe Checkout + webhook flow (re-enabled). Confirmation is server-verified (webhook signature on raw body, or `POST /payment/verify` from the success page), amount/currency checked, idempotent. Unpaid holds are released automatically. |
| Lifecycle | `PENDING_PAYMENT → CONFIRMED → INPROGRESS → COMPLETED / NO_SHOW`, `CONFIRMED ⇄ POSTPONED`, any active → `CANCELLED`. Invalid transitions return 409. Finished consultations auto-complete. |
| Cancellation | Patients cancel paid bookings up to `CANCELLATION_CUTOFF_HOURS` (default 24h) before start → full Stripe refund. Doctor/admin cancellations always refund. |
| Meet link | Doctor shares a validated `https://meet.google.com/xxx-xxxx-xxx` link for paid, confirmed bookings; patients only see it after confirmation. |
| Postponement | Doctor writes a message and picks one of their free slots. Patient accepts (old slot released) or cancels (both released, full refund). Per-booking message history (doctor, patient, admin). |
| Notifications | In-app notifications (list/paginate, unread count, mark read / read all), real-time SSE stream, optional email (Nodemailer). Events: booking created/confirmed/cancelled, Meet link, postponed, postponement response, new message, **10-minute reminder**, starting now, review request. |
| Scheduler | In-process job every 30s, fully DB-driven (`holdExpiresAt`, `reminderSentAt`, `startingSentAt`), so it survives restarts and never sends duplicates (atomic claim before sending). |
| Search | `GET /search?q=` role-scoped, grouped (doctors, patients, bookings, specialities), sanitised input, rate limited. |
| Audit | `audit_logs` for booking created/cancelled/postponed, payment confirmed/refunded, Meet link shared, schedule and doctor changes, password changes. |

## Tech stack

Node.js · Express 5 · TypeScript · PostgreSQL · Prisma 6 · Zod · Stripe · Nodemailer · Helmet · express-rate-limit · Vitest

## Getting started

```bash
cp .env.example .env          # fill in DATABASE_URL, secrets, Stripe test keys
npm install
npx prisma migrate deploy     # additive migrations only
npm run seed                  # idempotent demo data (safe to re-run)
npm run dev                   # http://localhost:5000
```

Scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `format`, `test`, `seed`, `migrate:deploy`.

Tests: `npm test` runs unit tests; `RUN_DB_TESTS=true npm test` also runs the database integration tests
(double booking under concurrency, past slots, payment idempotency, amount mismatch, hold expiry, reminder de-duplication, overlap, permissions).

### Environment variables

See [.env.example](.env.example). Validated at startup — the server refuses to boot with a clear message if something required is missing.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` | ✅ | Must match the frontend |
| `CLIENT_URL` | ✅ in prod | Frontend origin(s), comma-separated. Used for CORS, Stripe redirects and email links |
| `STRIPE_SECRET_KEY` | for payments | Test key in development |
| `STRIPE_WEBHOOK_SECRET` | recommended | Webhook endpoint: `<API>/api/v1/payment/webhook` (events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`). Without it, payments are still confirmed via the success-page verification. |
| `PAYMENT_CURRENCY` | | default `bdt` (as in the original flow) |
| `SLOT_HOLD_MINUTES` / `CANCELLATION_CUTOFF_HOURS` / `REMINDER_MINUTES_BEFORE` | | defaults 30 / 24 / 10 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | optional | Emails are skipped (and logged) when not set |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | | Admin created on first boot / seed; never overwritten |
| `APP_TIMEZONE` | | default `Asia/Dhaka`. Admin slot times are entered in this timezone; stored as UTC |
| `SEED_DEMO_DATA`, `DEMO_*` | | Demo doctor/patient for `npm run seed`; `SEED_DEMO_DATA=false` skips them |

## API overview (`/api/v1`)

| Method & path | Who | Purpose |
| --- | --- | --- |
| `POST /auth/login` · `/auth/logout` · `/auth/refresh-token` | all | Session (httpOnly cookies) |
| `POST /auth/forgot-password` · `/auth/reset-password` | public | Password reset (30-min single-use token) |
| `PATCH /auth/change-password` | logged in | Change password (old sessions invalidated) |
| `POST /schedule` · `GET /schedule` · `DELETE /schedule/:id` | admin (GET: doctor too) | Slot management (soft delete) |
| `POST /doctor-schedule` · `GET /doctor-schedule/my-schedule` · `DELETE /doctor-schedule/:id` | doctor | Offer / list / withdraw slots |
| `GET /doctor-schedule?doctorId=&date=` | logged in | Availability (future, unbooked) |
| `GET /doctor` · `GET /doctor/:id` | public | Directory and profile with bookable slots |
| `POST /appointment` | patient | Hold slot + Stripe Checkout URL |
| `GET /appointment` · `GET /appointment/:id` | role-scoped | List (filter/sort/paginate) and details |
| `POST /appointment/:id/cancel` | owner | Cancel (policy + refund) |
| `PATCH /appointment/:id/update-status` | doctor/admin | Valid transitions only |
| `PATCH /appointment/:id/meet-link` | doctor | Share Meet link |
| `POST /appointment/:id/postpone` · `/postpone/respond` | doctor · patient | Postponement flow |
| `GET/POST /appointment/:id/messages` | doctor, patient, admin | Message history |
| `POST /payment/checkout/:appointmentId` · `/payment/verify` · `/payment/webhook` | patient · Stripe | Payment |
| `GET /notification` · `/unread-count` · `/stream` · `PATCH /:id/read` · `/read-all` | logged in | Notifications |
| `GET /search?q=` | logged in | Role-scoped search |

All responses use `{ success, message, meta?, data }`; errors use `{ success: false, message, error? }` with meaningful status codes (400/401/403/404/409/429/5xx).

## User flows

- **Admin:** create slots → manage doctors/patients/admins/specialities → oversee all appointments → receives notifications for new paid bookings, postponements and refunds that need manual action.
- **Doctor:** pick slots to offer → gets notified of confirmed bookings → shares the Meet link → can postpone (message + new slot) → marks in progress / completed / no-show → writes prescriptions.
- **Patient:** browse doctors → pick a slot → pay (slot held meanwhile) → booking confirmed → sees Meet link, adds to calendar → reminder 10 minutes before → joins → reviews the doctor.

## Booking status lifecycle

```
PENDING_PAYMENT ──paid──▶ CONFIRMED ──▶ INPROGRESS ──▶ COMPLETED
      │                    │   ▲             └────────▶ NO_SHOW
      │ hold expired /     │   │ patient accepts
      │ cancelled          ▼   │
      └──────────────▶ CANCELLED ◀── POSTPONED (patient cancels → refund)
```
`SCHEDULED` is the legacy status of bookings made before this lifecycle; they can still be paid or cancelled.

## Security & data protection

Helmet headers, CORS allowlist, JSON/urlencoded body limits (1 MB), upload type/size limits, rate limits (stricter on login, register, password reset and search), Zod validation on inputs, ownership checks on every booking route (404 for other people's records), password hashes never selected (Prisma global `omit`), bcrypt hashing, httpOnly secure cookies, token invalidation on password change, server-side payment verification, idempotent webhooks, no card data stored, soft deletes for doctors and schedules, audit log, structured JSON logs.

## Deployment

`render-build.sh` runs `npm ci`, `prisma generate`, `build`, `prisma migrate deploy` (additive, safe on live data) and the idempotent seed (skip with `SEED_DEMO_DATA=false`).
Note: the partial unique index `appointments_active_doctor_slot_key` is created by raw SQL in a migration; if you later run `prisma migrate dev`, keep it in the generated migration.

## Demo credentials (after `npm run seed`)

| Role | Email | Password |
| --- | --- | --- |
| Doctor | `doctor@healthcare.dev` | `Doctor@12345` |
| Patient | `patient@healthcare.dev` | `Patient@12345` |

The admin account is created only from the `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` environment variables (nothing is hard-coded). Demo doctor/patient credentials can be changed with the `DEMO_*` env vars or through **Change password** in the app.
Stripe test card: `4242 4242 4242 4242`, any future date, any CVC.
