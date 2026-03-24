import Fastify from 'fastify';
import { createChildLogger } from './logger.js';

const log = createChildLogger('bootstrap');
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { registerLaunchRoutes } from './routes/launches.js';
import { eventsRoutes } from './routes/events.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { settingsRoutes } from './routes/settings.js';
import billingRoutes from './routes/billing.js';
import { requireAuth } from './middleware/requireAuth.js';

import { TwitterStreamClient } from './services/twitter-stream.service.js';
import { registerStaticRules } from './services/twitterapi.service.js';
import { startEnrichmentWorker } from './workers/enrichment.worker.js';
import { startAccountPollWorker } from './workers/account-poll.worker.js';
import { startCronWorker } from './workers/cron.worker.js';
import { scheduleCronJobs } from './queues/cron.queue.js';
import { warmupTesseract } from './ocr/image-ocr.js';

const streamClient = new TwitterStreamClient();

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'development' ? 'info' : 'warn',
    },
  });

  // Add raw body content type parser for Stripe webhook verification
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      // Store raw body for Stripe webhook signature verification
      (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      try {
        const json = JSON.parse((body as Buffer).toString());
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(helmet);
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });
  await app.register(cookie, {
    secret: config.SESSION_SECRET,
  });

  // Auth routes (no auth required)
  await app.register(authRoutes);

  // Protected routes — require auth
  await registerLaunchRoutes(app, requireAuth);
  await app.register(async (scope) => {
    scope.addHook('preHandler', requireAuth);
    await scope.register(eventsRoutes);
    await scope.register(settingsRoutes);
  });

  // Billing routes (mix of auth-required and webhook)
  await app.register(billingRoutes);

  // Admin routes (require admin)
  await app.register(adminRoutes);

  // Health check endpoint
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: config.NODE_ENV,
    });
  });

  // Warm up Tesseract (async, non-blocking — logs on completion)
  warmupTesseract().catch(err => {
    log.warn('Tesseract warmup failed', { err });
  });

  // Register static Tier A + Tier B rules (idempotent)
  try {
    await registerStaticRules();
    log.info('Static rules registered');
  } catch (err) {
    log.error('Failed to register static rules', { err });
    // Non-fatal — continue startup
  }

  // Start BullMQ workers
  startEnrichmentWorker();
  startAccountPollWorker();
  startCronWorker();

  await scheduleCronJobs();

  streamClient.connect();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  log.info('LaunchRadar backend listening', { port: config.PORT });
}

process.on('SIGTERM', async () => {
  log.info('SIGTERM received — shutting down gracefully');
  streamClient.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('SIGINT received — shutting down gracefully');
  streamClient.close();
  process.exit(0);
});

bootstrap().catch(err => {
  log.error('Fatal startup error', { err });
  process.exit(1);
});
