import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { Worker } from 'bullmq';

import '../helpers/ocr-mock.js';
import {
  mockStage1Yes,
  mockStage2Yes,
  mockStage2No,
  mockExtractor,
  getAiCallLog,
  getRemainingQueuedResponses,
} from '../helpers/ai-mock.js';
import { makeTierAPayload, makeTierBPayload } from '../helpers/fixtures.js';
import {
  waitForLaunchRecord,
  findLaunchByHandle,
  waitForQueueDrain,
} from '../helpers/db-helpers.js';
import { ingestTweet } from '../../services/ingest.service.js';
import { enrichLaunch } from '../../services/enrichment.service.js';
import { getBullMQConnection, redis } from '../../redis.js';
import { enrichmentQueue } from '../../queues/enrichment.queue.js';
import { prisma } from '../../db/client.js';
import type { EnrichmentJobData } from '../../types/index.js';

describe('Scenario 2: Tier A vs Tier B Routing', () => {
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

  it('2a - Tier A skips AI filters, goes straight to extraction', async () => {
    mockExtractor({
      projectName: 'DefiProjectXyz',
      chain: 'Solana',
      category: 'DeFi',
    });

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: 'defi_project_xyz' })
      .reply(200, {
        id: 'user_xyz',
        userName: 'defi_project_xyz',
        name: 'DeFi Project XYZ',
        description: 'Building DeFi on Solana',
        publicMetrics: { followersCount: 200, followingCount: 50, tweetCount: 100 },
      });

    const { tweetData, ruleLabel } = makeTierAPayload('chain_sol', {
      text: 'Something big is coming 🚀',
      author: { userName: 'defi_project_xyz' },
    });

    await ingestTweet(tweetData, ruleLabel);

    await waitForLaunchRecord('defi_project_xyz');
    await waitForQueueDrain([enrichmentQueue], 15000);

    const calls = getAiCallLog();
    expect(calls.filter(c => c.userContent.includes('Does this tweet announce'))).toHaveLength(0);
    expect(calls.filter(c => c.userContent.includes('Is this tweet related to a cryptocurrency'))).toHaveLength(0);
    expect(calls.filter(c => c.userContent.includes('Extract structured launch data')).length).toBeGreaterThanOrEqual(1);

    const record = await findLaunchByHandle('defi_project_xyz');
    expect(record).toBeTruthy();
    expect(record!.ruleSource).toBe('TIER_A');
  });

  it('2b - Tier B goes through both AI filters', async () => {
    mockStage1Yes();
    mockStage2Yes();
    mockExtractor({
      projectName: 'CryptoLaunchB',
      chain: 'Ethereum',
    });

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: 'crypto_launcher_b' })
      .reply(200, {
        id: 'user_b',
        userName: 'crypto_launcher_b',
        name: 'Crypto B',
        publicMetrics: { followersCount: 100, followingCount: 50, tweetCount: 50 },
      });

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: 'launching soon — big crypto project!',
      author: { userName: 'crypto_launcher_b', description: 'Crypto enthusiast' },
    });

    await ingestTweet(tweetData, ruleLabel);

    await waitForLaunchRecord('crypto_launcher_b');
    await waitForQueueDrain([enrichmentQueue], 15000);

    const calls = getAiCallLog();
    expect(calls.filter(c => c.userContent.includes('Does this tweet primarily announce')).length).toBeGreaterThanOrEqual(1);
    expect(calls.filter(c => c.userContent.includes('Is this tweet related to a cryptocurrency')).length).toBeGreaterThanOrEqual(1);

    const record = await findLaunchByHandle('crypto_launcher_b');
    expect(record).toBeTruthy();
    expect(record!.ruleSource).toBe('TIER_B');
  });

  it('2c - Tier B discarded by Stage 2 (not crypto)', async () => {
    mockStage1Yes();
    mockStage2No();

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: 'launching soon — our new coffee subscription box!',
      author: { userName: 'coffee_lover_xyz', description: 'Coffee entrepreneur' },
    });

    await ingestTweet(tweetData, ruleLabel);

    await new Promise(r => setTimeout(r, 2000));

    const record = await findLaunchByHandle('coffee_lover_xyz');
    expect(record).toBeNull();

    const signalCount = await prisma.tweetSignal.count({
      where: { authorHandle: 'coffee_lover_xyz' },
    });
    expect(signalCount).toBe(0);

    expect(getRemainingQueuedResponses()).toBe(0);
  });
});
