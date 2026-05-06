/**
 * Utilitaire de logging structuré pour Futéo.
 * Conçu pour être exploitable en temps réel par des services comme Vercel Logs, 
 * Datadog ou BetterStack.
 */

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

interface LogContext {
  service: string;
  action: string;
  env?: string;
  requestId?: string;
  sessionId?: string;
  keyCode?: string;
  latencyMs?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export function log(level: LogLevel, message: string, context: LogContext) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...context,
    env: process.env.NODE_ENV || "development"
  };

  // En production, on utilise JSON.stringify pour le parsing automatique par les collecteurs de logs
  if (process.env.NODE_ENV === "production") {
    console.log(JSON.stringify(logEntry));
  } else {
    // En développement, on garde un format lisible
    const color = level === "ERROR" ? "\x1b[31m" : level === "WARN" ? "\x1b[33m" : "\x1b[32m";
    const reset = "\x1b[0m";
    console.log(
      `${color}[${level}]${reset} ${timestamp} | ${context.service}:${context.action} | ${message}`,
      context.metadata ? context.metadata : ""
    );
  }
}

export const logger = {
  info: (msg: string, ctx: LogContext) => log("INFO", msg, ctx),
  warn: (msg: string, ctx: LogContext) => log("WARN", msg, ctx),
  error: (msg: string, ctx: LogContext) => log("ERROR", msg, ctx),
  debug: (msg: string, ctx: LogContext) => log("DEBUG", msg, ctx),
};

/**
 * Helper pour mesurer la latence d'une opération
 */
export async function withLatency<T>(
  action: () => Promise<T>
): Promise<{ result: T; latencyMs: number }> {
  const start = performance.now();
  const result = await action();
  const end = performance.now();
  return { result, latencyMs: Math.round(end - start) };
}
