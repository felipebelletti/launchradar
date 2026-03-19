import { Queue } from 'bullmq';
import { getBullMQConnection } from '../redis.js';
import type { AccountMonitorJobData } from '../types/index.js';

export const accountMonitorQueue = new Queue<AccountMonitorJobData>(
  'register-account-monitor',
  {
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
  }
);
