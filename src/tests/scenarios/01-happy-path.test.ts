import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { Worker } from 'bullmq';

import '../helpers/ocr-mock.js';
import {
  mockStage1Yes,
  mockStage2Yes,
  mockExtractor,
} from '../helpers/ai-mock.js';
import { makeTierBPayload } from '../helpers/fixtures.js';
import {
  waitForLaunchRecord,
  waitForConfidence,
  getTweetSignals,
  getMonitoredAccount,
  waitForQueueDrain,
} from '../helpers/db-helpers.js';
import { ingestTweet } from '../../services/ingest.service.js';
import { enrichLaunch } from '../../services/enrichment.service.js';
import { getBullMQConnection } from '../../redis.js';
import { enrichmentQueue } from '../../queues/enrichment.queue.js';
import { redis } from '../../redis.js';
import type { EnrichmentJobData } from '../../types/index.js';

describe('Scenario 1: Happy Path', () => {
  let enrichmentWorker: Worker<EnrichmentJobData>;

  beforeAll(async () => {
    enrichmentWorker = new Worker<EnrichmentJobData>(
      'enrich-launch',
      async (job) => { await enrichLaunch(job.data.launchRecordId); },
      { connection: getBullMQConnection(), concurrency: 1 }
    );
  });

  afterAll(async () => {
    await enrichmentWorker.close();
  });

  it('should ingest a Tier B crypto tweet through the full pipeline', async () => {
    mockStage1Yes();
    mockStage2Yes();
    mockExtractor({
      projectName: 'AquaFi',
      chain: 'Solana',
      category: 'DeFi',
      launchDate: '2025-03-22T00:00:00Z',
      launchDateRaw: 'soon',
      launchType: 'presale',
      website: 'aquafi.io',
      summary: 'AquaFi is a DeFi protocol launching on Solana',
    });

    const profileScope = nock('https://twitterapi.io')
      .get('/api/twitter/user/info')
      .query({ userName: 'aquafi_official' })
      .reply(200, {
        id: 'user_001',
        userName: 'aquafi_official',
        name: 'AquaFi',
        description: 'DeFi protocol | Powered by Solana',
        website: 'https://aquafi.io',
        publicMetrics: { followersCount: 4200, followingCount: 100, tweetCount: 500 },
        isVerified: false,
        isBlueVerified: false,
      });

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: 'AquaFi is launching soon! 🌊 DeFi protocol on Solana',
      author: {
        userName: 'aquafi_official',
        name: 'AquaFi',
        description: 'DeFi protocol | Powered by Solana',
        followers: 4200,
      },
    });

    await ingestTweet(tweetData, ruleLabel);

    const stubRecord = await waitForLaunchRecord('aquafi_official');
    expect(stubRecord).toBeTruthy();

    const signals = await getTweetSignals(stubRecord.id);
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(signals[0].tweetId).toBe(tweetData.id);

    await waitForQueueDrain([enrichmentQueue], 15000);

    const enrichedRecord = await waitForConfidence('aquafi_official', 0.7, 10000);

    expect(enrichedRecord.chain).toBe('Solana');
    expect(enrichedRecord.projectName).toBe('AquaFi');
    expect(enrichedRecord.website).toBe('aquafi.io');
    expect(enrichedRecord.twitterFollowers).toBe(4200);
    expect(enrichedRecord.confidenceScore).toBeGreaterThanOrEqual(0.7);
    expect(['CONFIRMED', 'VERIFIED', 'PARTIAL']).toContain(enrichedRecord.status);

    const monitored = await getMonitoredAccount('aquafi_official');
    expect(monitored).toBeTruthy();
    expect(monitored!.active).toBe(true);

    expect(profileScope.isDone()).toBe(true);
  });
});
