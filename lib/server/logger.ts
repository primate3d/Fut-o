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

const SENSITIVE_FIELD_PATTERN =
  /first500|extractedText|address|fullName|firstName|lastName|customerNumber|contractNumber|invoiceNumber|phone|email|keyCode|physicalFileName|fullPath|fileName|amount|price|saving|error/i;

function maskString(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_MASQUE]")
    .replace(/\b(?:\d[ .-]?){8,14}\b/g, "[NUMERO_MASQUE]")
    .slice(0, 240);
}

function sanitizeLogValue(value: unknown, fieldName?: string): unknown {
  if (fieldName && SENSITIVE_FIELD_PATTERN.test(fieldName)) {
    return "[MASQUE]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeLogValue(item, key)])
    );
  }

  return typeof value === "string" ? maskString(value) : value;
}

export function log(level: LogLevel, message: string, context: LogContext) {
  const production = process.env.NODE_ENV === "production";
  const safeContext = production
    ? (sanitizeLogValue(context) as LogContext)
    : context;
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...safeContext,
    env: process.env.NODE_ENV || "development"
  };

  if (production) {
    console.log(JSON.stringify(logEntry));
    return;
  }

  const color =
    level === "ERROR" ? "\x1b[31m" : level === "WARN" ? "\x1b[33m" : "\x1b[32m";
  console.log(
    `${color}[${level}]\x1b[0m ${logEntry.timestamp} | ${context.service}:${context.action} | ${message}`,
    context.metadata ?? ""
  );
}

export const logger = {
  info: (message: string, context: LogContext) => log("INFO", message, context),
  warn: (message: string, context: LogContext) => log("WARN", message, context),
  error: (message: string, context: LogContext) => log("ERROR", message, context),
  debug: (message: string, context: LogContext) => log("DEBUG", message, context)
};

export async function withLatency<T>(
  action: () => Promise<T>
): Promise<{ result: T; latencyMs: number }> {
  const start = performance.now();
  const result = await action();
  return {
    result,
    latencyMs: Math.round(performance.now() - start)
  };
}
