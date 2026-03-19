import Fastify from 'fastify';
import { createChildLogger } from './logger.js';

const log = createChildLogger('bootstrap');
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { redis } from './redis.js';
import { registerLaunchRoutes } from './routes/launches.js';
import { RuleManagerService } from './services/rule-manager.service.js';
import { TwitterStreamClient } from './services/twitter-stream.service.js';
import { startEnrichmentWorker } from './workers/enrichment.worker.js';
import { startAccountMonitorWorker } from './workers/account-monitor.worker.js';
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

  await app.register(helmet);
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  await registerLaunchRoutes(app);

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

  // Initialize RuleManagerService
  const ruleManager = new RuleManagerService(redis);

  try {
    await ruleManager.initialize();
    log.info('RuleManagerService initialized');
  } catch (err) {
    log.error('Failed to initialize RuleManagerService', { err });
    // Non-fatal — continue startup
  }

  // Register static Tier A + Tier B rules (idempotent)
  try {
    await ruleManager.registerStaticRules();
    log.info('Static rules registered');
  } catch (err) {
    log.error('Failed to register static rules', { err });
    // Non-fatal — continue startup
  }

  // Start BullMQ workers
  startEnrichmentWorker();
  startAccountMonitorWorker(ruleManager);
  startCronWorker(ruleManager);

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
