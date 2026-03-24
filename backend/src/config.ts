import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  TWITTERAPI_KEY: z.string().min(1),
  XAI_API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WEBHOOK_POLL_INTERVAL_SECONDS: z.coerce.number().default(60),
  DAILY_CREDIT_BUDGET: z.coerce.number().default(100000),
  ACCOUNT_MONITOR_TTL_DAYS: z.coerce.number().default(15),
  ACCOUNT_POLL_INTERVAL_MS: z.coerce.number().default(300000),

  // Auth
  SESSION_SECRET: z.string().min(32).default('change-me-to-a-random-32-char-string!!'),
  SESSION_MAX_AGE_DAYS: z.coerce.number().default(30),

  // X OAuth
  TWITTER_CLIENT_ID: z.string().default(''),
  TWITTER_CLIENT_SECRET: z.string().default(''),
  TWITTER_CALLBACK_URL: z.string().default('http://localhost:3000/auth/twitter/callback'),

  // Email (Resend)
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('security@launchradar.xyz'),

  // Geolocation
  GEOIP_PROVIDER: z.enum(['ip-api', 'abstractapi']).default('ip-api'),
  ABSTRACTAPI_KEY: z.string().default(''),

  // Frontend URL (for CORS / redirects)
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PRICE_SCOUT: z.string().default(''),
  STRIPE_PRICE_ALPHA: z.string().default(''),
  STRIPE_PRICE_PRO: z.string().default(''),

  // Trial
  TRIAL_DURATION_DAYS: z.coerce.number().default(3),
  TRIAL_PLAN: z.enum(['FREE', 'SCOUT', 'ALPHA', 'PRO']).default('ALPHA'),

  // AlphaGate (optional — integration only runs if both are set)
  ALPHAGATE_COOKIE_NAME: z.string().default(''),
  ALPHAGATE_COOKIE_VALUE: z.string().default(''),
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
