import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CLIENT_ORIGIN: z.string().url(),
  MONGODB_URI: z.string().min(1),
  NLP_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),
  INTERNAL_KEY: z.string().default(''),
  JWT_ACCESS_SECRET: z.string().min(32).default('development-access-secret-change-me-000000'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32).default('development-refresh-secret-change-me-000000'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  DEMO_PASSWORD: z.string().optional(),
  ENABLE_OLLAMA: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map(({ path, message }) => `${path.join('.')}: ${message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

/** Validated environment configuration shared by the backend. */
export const env = Object.freeze(parsedEnv.data);
