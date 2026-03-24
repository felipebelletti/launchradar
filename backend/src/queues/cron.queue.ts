import { Queue } from 'bullmq';
import { getBullMQConnection } from '../redis.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('cron-queue');

export interface CronJobData {
  jobName: string;
}

export const cronQueue = new Queue<CronJobData>('cron-jobs', {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 20 },
  },
});

/**
 * Schedule the daily expire-stale-monitors cron job.
 * Uses BullMQ repeatable jobs — idempotent, safe to call on every startup.
 */
export async function scheduleCronJobs(): Promise<void> {
  await cronQueue.add(
    'expire-stale-monitors',
    { jobName: 'expire-stale-monitors' },
    {
      repeat: {
        pattern: '0 2 * * *', // Every day at 02:00 UTC
      },
    }
  );

  log.info('Scheduled cron job: expire-stale-monitors (daily at 02:00 UTC)');
}
