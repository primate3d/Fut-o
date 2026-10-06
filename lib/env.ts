import { z } from "zod";

const optionalString = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().optional()
);
const optionalEmail = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().email().optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url("DATABASE_URL doit etre une URL PostgreSQL valide"),
  OPENAI_API_KEY: z.string().default(""),
  FUTEO_LOCAL_E2E: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_PRICE_AUDIT_FOYER: optionalString,
  STRIPE_PRICE_AUDIT_FAMILLE: optionalString,
  BREVO_API_KEY: optionalString,
  BREVO_FROM_EMAIL: optionalEmail,
  BREVO_FROM_NAME: optionalString,
  NEXT_PUBLIC_BASE_URL: z.string().url("NEXT_PUBLIC_BASE_URL doit etre une URL valide"),
  NEXT_PUBLIC_APP_URL: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().url("NEXT_PUBLIC_APP_URL doit etre une URL valide").optional()
  ),
  UPLOADS_DIR: z.string().trim().min(1, "UPLOADS_DIR est obligatoire"),
  CRON_SECRET: optionalString
});

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  const isProduction = input.NODE_ENV === "production";
  const parsed = envSchema.safeParse({
    ...input,
    DATABASE_URL:
      input.DATABASE_URL || (isProduction ? undefined : "postgresql://futeo:futeo@localhost:5432/futeo"),
    NEXT_PUBLIC_BASE_URL:
      input.NEXT_PUBLIC_BASE_URL || (isProduction ? undefined : "http://localhost:3000"),
    UPLOADS_DIR: input.UPLOADS_DIR || (isProduction ? undefined : "./server-data/uploads")
  });

  if (parsed.success) return parsed.data;

  if (isProduction) {
    throw new Error(
      `Configuration de production invalide: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`
    );
  }

  console.warn("Variables d'environnement incompletes ou invalides:");
  console.warn(parsed.error.flatten().fieldErrors);
  return envSchema.parse({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://futeo:futeo@localhost:5432/futeo",
    OPENAI_API_KEY: "",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    UPLOADS_DIR: "./server-data/uploads"
  });
}

export const env = parseEnvironment(process.env);

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
