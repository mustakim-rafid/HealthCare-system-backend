import { Server } from "http";
import app from "./app";
import config from "./config";
import { seedAdmin } from "./helper/seedAdmin";
import { prisma } from "./utils/prisma";
import { logger } from "./utils/logger";
import { startJobs, stopJobs } from "./jobs";

let server: Server | undefined;

const shutdown = (reason: string, code: number) => {
  logger.info("Shutting down", { reason });
  stopJobs();
  const finish = async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(code);
  };
  if (server) server.close(() => void finish());
  else void finish();
  // Force exit if connections do not drain in time
  setTimeout(() => process.exit(code), 10_000).unref();
};

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled promise rejection", { err: error as Error });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { err: error });
  shutdown("uncaughtException", 1);
});

process.on("SIGTERM", () => shutdown("SIGTERM", 0));
process.on("SIGINT", () => shutdown("SIGINT", 0));

async function bootstrap() {
  try {
    await prisma.$connect();
    await seedAdmin();

    server = app.listen(config.port, () => {
      logger.info(`Server is running on port ${config.port}`, { env: config.node_env });
    });

    if (!config.jobs_disabled) startJobs();
  } catch (error) {
    logger.error("Error during server startup", { err: error as Error });
    process.exit(1);
  }
}

bootstrap();
