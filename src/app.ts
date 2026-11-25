import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import globalErrorHandler from "./middlewares/globalErrorHandler";
import notFound from "./middlewares/notFound";
import router from "./routes";
import config from "./config";
import { paymentController } from "./module/payment/payment.controller";
import { apiLimiter } from "./middlewares/rateLimiter";
import { prisma } from "./utils/prisma";

const app: Application = express();

// Behind Render/Vercel style proxies: needed for correct client IPs in rate limiting
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Server-to-server calls (Next.js server actions, Stripe webhooks, curl) have no Origin header
      if (!origin || config.client_urls.includes(origin.replace(/\/$/, ""))) return callback(null, true);
      if (!config.isProduction && /^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);

// Stripe webhooks must receive the raw body for signature verification, so they are
// mounted before the JSON parser. `/api/v1/webhook` is kept for backward compatibility.
const rawJson = express.raw({ type: "application/json", limit: "1mb" });
app.post("/api/v1/payment/webhook", rawJson, paymentController.stripeWebhook);
app.post("/api/v1/webhook", rawJson, paymentController.stripeWebhook);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

app.get("/", (_req: Request, res: Response) => {
  res.send({
    message: "Health Care API",
    docs: "/api/v1/docs",
    health: "/health",
  });
});

app.get("/health", async (_req: Request, res: Response) => {
  let database = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "down";
  }
  res.status(database === "up" ? 200 : 503).json({
    status: database === "up" ? "ok" : "degraded",
    database,
    uptime: Math.floor(process.uptime()),
    time: new Date().toISOString(),
  });
});

app.use("/api/v1", apiLimiter, router);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
