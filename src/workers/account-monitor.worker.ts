import { Worker } from 'bullmq';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('account-monitor-worker');
import { getBullMQConnection } from '../redis.js';
import type { AccountMonitorJobData } from '../types/index.js';
import type { RuleManagerService } from '../services/rule-manager.service.js';

export function startAccountMonitorWorker(
  ruleManager: RuleManagerService
): Worker<AccountMonitorJobData> {
  const worker = new Worker<AccountMonitorJobData>(
    'register-account-monitor',
    async (job) => {
      const { twitterHandle, launchRecordId } = job.data;
      log.info('Processing account monitor job', { twitterHandle });
      await ruleManager.registerAccountMonitor(twitterHandle, launchRecordId);
    },
    {
      connection: getBullMQConnection(),
      concurrency: 2,
    }
  );

  worker.on('completed', (job) => {
    log.info('Account monitor job completed', {
      jobId: job.id,
      twitterHandle: job.data.twitterHandle,
    });
  });

  worker.on('failed', (job, err) => {
    log.error('Account monitor job failed', {
      jobId: job?.id,
      twitterHandle: job?.data.twitterHandle,
      err,
    });
  });

  log.info('Account monitor worker started');
  return worker;
}
