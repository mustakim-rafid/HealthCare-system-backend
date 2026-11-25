import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

dotenv.config({ path: path.join(process.cwd(), ".env") });

/**
 * Environment is validated once at startup so a misconfigured deploy fails fast
 * with a readable message instead of crashing on the first request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("5000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CLIENT_URL: z.string().default("http://localhost:3000"),
  BCRYPT_SALT_ROUND: z.string().default("10"),
  ACCESS_TOKEN_SECRET: z.string().min(1, "ACCESS_TOKEN_SECRET is required"),
  ACCESS_TOKEN_EXPIRY: z.string().default("1h"),
  REFRESH_TOKEN_SECRET: z.string().min(1, "REFRESH_TOKEN_SECRET is required"),
  REFRESH_TOKEN_EXPIRY: z.string().default("10d"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_CURRENCY: z.string().default("bdt"),
  APP_TIMEZONE: z
    .string()
    .default("Asia/Dhaka")
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "APP_TIMEZONE must be a valid IANA timezone, e.g. Asia/Dhaka"),
  OPENROUTER_API_KEY: z.string().optional(),
  SUPER_ADMIN_EMAIL: z.string().optional(),
  SUPER_ADMIN_PASSWORD: z.string().optional(),
  SLOT_HOLD_MINUTES: z.coerce.number().int().min(30).max(24 * 60).default(30),
  CANCELLATION_CUTOFF_HOURS: z.coerce.number().min(0).default(24),
  REMINDER_MINUTES_BEFORE: z.coerce.number().int().min(1).default(10),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("Health Care <no-reply@healthcare.local>"),
  DISABLE_JOBS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "❌ Invalid environment configuration:\n" +
      parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
  );
  process.exit(1);
}

const env = parsed.data;

export default {
  node_env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  port: env.PORT,
  database_url: env.DATABASE_URL,
  client_urls: env.CLIENT_URL.split(",").map((u) => u.trim().replace(/\/$/, "")).filter(Boolean),
  client_url: env.CLIENT_URL.split(",")[0].trim().replace(/\/$/, ""),
  client_url_configured: Boolean(process.env.CLIENT_URL),
  cloudinary: {
    cloudinary_cloud_name: env.CLOUDINARY_CLOUD_NAME,
    cloudinary_api_key: env.CLOUDINARY_API_KEY,
    cloudinary_api_secret: env.CLOUDINARY_API_SECRET,
  },
  access_token_secret: env.ACCESS_TOKEN_SECRET,
  access_token_expiry: env.ACCESS_TOKEN_EXPIRY,
  refresh_token_secret: env.REFRESH_TOKEN_SECRET,
  refresh_token_expiry: env.REFRESH_TOKEN_EXPIRY,
  stripe_secret_key: env.STRIPE_SECRET_KEY,
  stripe_webhook_secret: env.STRIPE_WEBHOOK_SECRET,
  payment_currency: env.PAYMENT_CURRENCY,
  app_timezone: env.APP_TIMEZONE,
  openrouter_api_key: env.OPENROUTER_API_KEY,
  bcrypt_salt_round: env.BCRYPT_SALT_ROUND,
  super_admin: {
    email: env.SUPER_ADMIN_EMAIL,
    password: env.SUPER_ADMIN_PASSWORD,
  },
  booking: {
    slot_hold_minutes: env.SLOT_HOLD_MINUTES,
    cancellation_cutoff_hours: env.CANCELLATION_CUTOFF_HOURS,
    reminder_minutes_before: env.REMINDER_MINUTES_BEFORE,
  },
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.EMAIL_FROM,
  },
  jobs_disabled: env.DISABLE_JOBS === "true",
};
