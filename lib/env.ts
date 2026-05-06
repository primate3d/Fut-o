import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL doit être une URL PostgreSQL valide")
    .default("postgresql://futeo:futeo@localhost:5432/futeo"),
  OPENAI_API_KEY: z.string().default(""),
  STRIPE_SECRET_KEY: z.string().default("sk_test_placeholder"),
  STRIPE_WEBHOOK_SECRET: z.string().default("whsec_placeholder"),
  RESEND_API_KEY: z.string().optional(),
  NEXT_PUBLIC_BASE_URL: z
    .string()
    .url("NEXT_PUBLIC_BASE_URL doit être une URL valide")
    .default("http://localhost:3000"),
  UPLOADS_DIR: z.string().default("./server-data/uploads")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.warn("Variables d'environnement incomplètes ou invalides:");
  console.warn(parsedEnv.error.flatten().fieldErrors);
}

export const env = parsedEnv.success ? parsedEnv.data : envSchema.parse({});
