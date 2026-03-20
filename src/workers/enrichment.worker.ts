import { Worker } from 'bullmq';
import { getBullMQConnection } from '../redis.js';
import { enrichLaunch } from '../services/enrichment.service.js';
import { createChildLogger } from '../logger.js';
import type { EnrichmentJobData } from '../types/index.js';

const log = createChildLogger('enrichment-worker');

export function startEnrichmentWorker(): Worker<EnrichmentJobData> {
  const worker = new Worker<EnrichmentJobData>(
    'enrich-launch',
    async (job) => {
      log.info('Processing enrichment job', { launchRecordId: job.data.launchRecordId });
      await enrichLaunch(job.data.launchRecordId, job.data.timing, job.data.triggerTweetId);
    },
    {
      connection: getBullMQConnection(),
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    log.info('Enrichment job completed', {
      jobId: job.id,
      launchRecordId: job.data.launchRecordId,
    });
  });

  worker.on('failed', (job, err) => {
    log.error('Enrichment job failed', {
      jobId: job?.id,
      launchRecordId: job?.data.launchRecordId,
      err,
    });
  });

  log.info('Enrichment worker started');
  return worker;
}
