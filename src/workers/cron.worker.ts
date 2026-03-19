import { Worker } from 'bullmq';
import { getBullMQConnection } from '../redis.js';
import type { CronJobData } from '../queues/cron.queue.js';
import type { RuleManagerService } from '../services/rule-manager.service.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('cron-worker');

export function startCronWorker(
  ruleManager: RuleManagerService
): Worker<CronJobData> {
  const worker = new Worker<CronJobData>(
    'cron-jobs',
    async (job) => {
      const { jobName } = job.data;
      log.info('Running cron job', { jobName });

      if (jobName === 'expire-stale-monitors') {
        await ruleManager.expireStale();
      } else {
        log.warn('Unknown cron job', { jobName });
      }
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1,
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
