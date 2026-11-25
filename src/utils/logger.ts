/* Minimal structured (JSON lines) logger — no extra dependency, works with any log drain. */
type Level = "debug" | "info" | "warn" | "error";

const serialize = (meta?: Record<string, unknown>) => {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v;
  }
  return out;
};

const write = (level: Level, msg: string, meta?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...serialize(meta) });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
};

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};
