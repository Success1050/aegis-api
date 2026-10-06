import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Redis / Queue Config
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // JWT Configuration
  JWT_ACCESS_SECRET: z.string().default('aegis-dev-super-secure-access-token-secret-key-32-chars!'),
  JWT_REFRESH_SECRET: z.string().default('aegis-dev-super-secure-refresh-token-secret-key-32-chars!'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // SMS & Messaging Configuration
  SMS_PROVIDER: z.enum(['fake', 'termii', 'africastalking']).default('fake'),
  SMS_SENDER_ID: z.string().default('AEGIS'),
  FAKE_SMS_FAIL_RATE: z.coerce.number().min(0).max(1).default(0),
  FAKE_SMS_LATENCY_MS: z.coerce.number().min(0).default(50),
  PRESERVE_DIACRITICS: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  // Incident & Alert Policies
  ALLOW_SELF_VERIFY: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  ALLOW_UNREVIEWED_TEMPLATES: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  INCIDENT_EXPIRY_MINUTES: z.coerce.number().int().positive().default(60),
  MAX_RECIPIENTS_PER_INCIDENT: z.coerce.number().int().positive().default(2000),

  // Security & Webhook Signatures
  WEBHOOK_HMAC_SECRET: z.string().default('aegis-webhook-dev-secret-key-signature'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.format();
    const formatted = JSON.stringify(errors, null, 2);
    throw new Error(`\n❌ [Configuration Error] Invalid environment variables:\n${formatted}\n`);
  }

  return result.data;
}
