import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  TWITTERAPI_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WEBHOOK_POLL_INTERVAL_SECONDS: z.coerce.number().default(60),
  DAILY_CREDIT_BUDGET: z.coerce.number().default(100000),
  ACCOUNT_MONITOR_TTL_DAYS: z.coerce.number().default(15),
  ACCOUNT_POLL_INTERVAL_MS: z.coerce.number().default(300000),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    `Invalid environment variables:\n${JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)}\n`
  );
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
