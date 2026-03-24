import { Queue } from 'bullmq';
import { getBullMQConnection } from '../redis.js';
import { config } from '../config.js';

export const accountPollQueue = new Queue('account-poll', {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

/**
 * Register a new account for repeatable polling.
 * Uses jobId = poll:<handle> so duplicate registrations are silently ignored by BullMQ.
 */
export async function registerAccountPolling(handle: string): Promise<void> {
  await accountPollQueue.add(
    'poll-account',
    { handle },
    {
      jobId: `poll:${handle}`,
      repeat: {
        every: config.ACCOUNT_POLL_INTERVAL_MS,
      },
    }
  );
}

/**
 * Stop polling a handle (called by expire-stale-monitors cron).
 */
export async function deregisterAccountPolling(handle: string): Promise<void> {
  await accountPollQueue.removeRepeatable('poll-account', {
    every: config.ACCOUNT_POLL_INTERVAL_MS,
    jobId: `poll:${handle}`,
  });
}
