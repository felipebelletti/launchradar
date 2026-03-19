import { Redis } from 'ioredis';
import { config } from './config.js';
import { createChildLogger } from './logger.js';

const log = createChildLogger('redis');

// Application Redis client (used for credit tracking, rule counts, etc.)
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err: Error) => {
  log.error('Redis connection error', { err });
});

redis.on('connect', () => {
  log.info('Redis connected');
});

/**
 * Connection options object used by BullMQ queues and workers.
 * BullMQ bundles its own ioredis copy so we pass config, not a Redis instance,
 * to avoid a type incompatibility between the two ioredis versions.
 */
export function getBullMQConnection(): { url: string; maxRetriesPerRequest: null; enableReadyCheck: boolean } {
  return {
    url: config.REDIS_URL,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
