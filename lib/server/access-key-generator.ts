import { randomBytes } from "node:crypto";

export type ServerAccessKeyFormat = "discovery" | "paid";

export function generateServerAccessKeyCode(format: ServerAccessKeyFormat) {
  if (format === "discovery") {
    return `FUTEO-DECOUVERTE-${randomBytes(16).toString("hex").toUpperCase()}`;
  }

  const token = randomBytes(12).toString("hex").toUpperCase();
  return `FF-${token.slice(0, 8)}-${token.slice(8, 16)}-${token.slice(16)}`;
}
