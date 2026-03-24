import { Worker } from 'bullmq';
import { getBullMQConnection } from '../redis.js';
import { prisma } from '../db/client.js';
import { deregisterAccountPolling } from '../queues/account-poll.queue.js';
import { config } from '../config.js';
import type { CronJobData } from '../queues/cron.queue.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('cron-worker');

async function expireStaleMonitors(): Promise<void> {
  const cutoff = new Date(Date.now() - config.ACCOUNT_MONITOR_TTL_DAYS * 86400000);

  const stale = await prisma.monitoredAccount.findMany({
    where: {
      active: true,
      lastTweetAt: { lt: cutoff },
    },
  });

  log.info('Expiring stale monitored accounts', { count: stale.length });

  for (const monitor of stale) {
    try {
      await deregisterAccountPolling(monitor.twitterHandle);

      await prisma.monitoredAccount.update({
        where: { id: monitor.id },
        data: { active: false },
      });

      log.info('Expired stale monitor', { twitterHandle: monitor.twitterHandle });
    } catch (err) {
      log.error('Failed to expire account', { twitterHandle: monitor.twitterHandle, err });
    }
  }
}

export function startCronWorker(): Worker<CronJobData> {
  const worker = new Worker<CronJobData>(
    'cron-jobs',
    async (job) => {
      const { jobName } = job.data;
      log.info('Running cron job', { jobName });

      if (jobName === 'expire-stale-monitors') {
        await expireStaleMonitors();
      } else {
        log.warn('Unknown cron job', { jobName });
      }
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1,
      lockDuration: 120_000,
    }
  );

  worker.on('completed', (job) => {
    log.info('Cron job completed', { jobName: job.data.jobName });
  });

  worker.on('failed', (job, err) => {
    log.error('Cron job failed', { jobName: job?.data.jobName, err });
  });

  log.info('Cron worker started');
  return worker;
}
