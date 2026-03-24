import { Queue } from 'bullmq';
import { getBullMQConnection } from '../redis.js';
import type { EnrichmentJobData } from '../types/index.js';

export const enrichmentQueue = new Queue<EnrichmentJobData>('enrich-launch', {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: { count: 50 },
  },
});
