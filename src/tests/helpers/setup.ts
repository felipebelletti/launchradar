import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { resetAiMock } from './ai-mock.js';
import { resetOcrMock } from './ocr-mock.js';
import { resetTestData } from './db-helpers.js';

// These imports trigger module-level side effects (Redis, Prisma connections)
// Env vars must be set via vitest.config.ts `env` before these load
import { prisma } from '../../db/client.js';
import { redis } from '../../redis.js';
import { enrichmentQueue } from '../../queues/enrichment.queue.js';
import { accountPollQueue } from '../../queues/account-poll.queue.js';

beforeAll(async () => {
  // Run Prisma migrations on the test database
  const { execSync } = await import('node:child_process');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'pipe',
  });

  // Flush the test Redis database
  await redis.flushdb();

  // Clean any stale data from prior test runs
  await resetTestData();

  // Disable real HTTP requests (except localhost for Fastify/supertest)
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');
});

beforeEach(async () => {
  // Ensure clean DB state before each test
  await resetTestData();
});

afterEach(async () => {
  // Drain any leftover jobs FIRST (before cleanup breaks their DB writes)
  await enrichmentQueue.obliterate({ force: true }).catch(() => {});
  await accountPollQueue.obliterate({ force: true }).catch(() => {});

  // Small delay to let any in-flight workers finish
  await new Promise(r => setTimeout(r, 100));

  // Clean up nock interceptors
  nock.cleanAll();

  // Reset AI and OCR mocks
  resetAiMock();
  resetOcrMock();

  // Wipe DB tables
  await resetTestData();

  // Flush Redis between tests
  await redis.flushdb();
});

afterAll(async () => {
  // Clean up connections
  nock.enableNetConnect();
  nock.cleanAll();
  if (nock.isActive()) {
    nock.restore();
  }

  await enrichmentQueue.close();
  await accountPollQueue.close();
  await redis.quit();
  await prisma.$disconnect();
});
