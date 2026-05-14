import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL doit être une URL PostgreSQL valide")
    .default("postgresql://futeo:futeo@localhost:5432/futeo"),
  OPENAI_API_KEY: z.string().default(""),
  FUTEO_LOCAL_E2E: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_PRICE_AUDIT_FOYER: z.string().optional(),
  STRIPE_PRICE_AUDIT_FAMILLE: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  BREVO_FROM_EMAIL: z.string().email().optional(),
  BREVO_FROM_NAME: z.string().optional(),
  NEXT_PUBLIC_BASE_URL: z
    .string()
    .url("NEXT_PUBLIC_BASE_URL doit être une URL valide")
    .default("http://localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL doit être une URL valide").optional(),
  UPLOADS_DIR: z.string().default("./server-data/uploads"),
  CRON_SECRET: z.string().optional()
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.warn("Variables d'environnement incomplètes ou invalides:");
  console.warn(parsedEnv.error.flatten().fieldErrors);
}

export const env = parsedEnv.success ? parsedEnv.data : envSchema.parse({});

const placeholderValues = new Set([
  "",
  "sk_test_placeholder",
  "whsec_placeholder",
  "placeholder",
  "changeme",
  "change_me"
]);

export function isPlaceholderEnvValue(value?: string | null) {
  return placeholderValues.has((value ?? "").trim());
}

export function requireServerEnv(name: keyof typeof env) {
  const value = process.env[name];

  if (isPlaceholderEnvValue(value)) {
    throw new Error(`${name} manquante ou placeholder`);
  }

  return value as string;
}

export function allowDevOnlyMocks() {
  return process.env.NODE_ENV !== "production" || process.env.FUTEO_LOCAL_E2E === "1";
}
