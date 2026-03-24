import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { Worker } from 'bullmq';

import '../helpers/ocr-mock.js';
import {
  mockStage1Yes,
  mockShillNo,
  mockStage2Yes,
  mockTimingFuture,
  mockExtractor,
} from '../helpers/ai-mock.js';
import { makeTierBPayload, makeTierCPayload } from '../helpers/fixtures.js';
import type { TestTweetPayload } from '../helpers/fixtures.js';
import {
  waitForLaunchRecord,
  findLaunchByHandle,
  getTweetSignals,
  getLaunchSources,
  waitForQueueDrain,
} from '../helpers/db-helpers.js';
import { ingestTweet } from '../../services/ingest.service.js';
import { enrichLaunch } from '../../services/enrichment.service.js';
import { getBullMQConnection, redis } from '../../redis.js';
import { enrichmentQueue } from '../../queues/enrichment.queue.js';
import { prisma } from '../../db/client.js';
import type { EnrichmentJobData } from '../../types/index.js';

describe('Scenario 4: Progressive Enrichment', () => {
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

  function mockProfileLookup(): void {
    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: 'solrise_finance' })
      .reply(200, {
        id: 'user_solrise',
        userName: 'solrise_finance',
        name: 'Solrise Finance',
        description: 'Building on Solana',
        website: 'https://solrise.finance',
        publicMetrics: { followersCount: 800, followingCount: 200, tweetCount: 300 },
        isVerified: false,
      });
  }

  async function sendTweet(payload: TestTweetPayload): Promise<void> {
    await ingestTweet(payload.tweetData, payload.ruleLabel);
  }

  it('should progressively enrich a LaunchRecord through three tweets', async () => {
    // === Tweet 1 (Tier B — initial signal) ===
    mockStage1Yes();
    mockShillNo();
    mockStage2Yes();
    mockTimingFuture();
    mockExtractor({
      projectName: 'Solrise',
      chain: 'Solana',
      confidence: { projectName: 0.7, chain: 0.8, launchDate: 0 },
    });
    mockProfileLookup();

    const tweet1 = makeTierBPayload({
      text: 'something HUGE launching soon, stay tuned 👀',
      author: {
        userName: 'solrise_finance',
        name: 'Solrise Finance',
        description: 'Building on Solana',
        followers: 800,
      },
    });

    await sendTweet(tweet1);

    let record = await waitForLaunchRecord('solrise_finance');
    await waitForQueueDrain([enrichmentQueue], 15000);

    const countAfterTweet1 = await prisma.launchRecord.count({
      where: { twitterHandle: 'solrise_finance' },
    });
    expect(countAfterTweet1).toBe(1);

    let signals = await getTweetSignals(record.id);
    expect(signals).toHaveLength(1);

    record = (await findLaunchByHandle('solrise_finance'))!;
    expect(record.launchDate).toBeNull();

    // === Tweet 2 (Tier C — follow-up from monitored account) ===
    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();
    mockExtractor({
      projectName: 'Solrise Finance',
      launchDate: '2025-03-28T00:00:00Z',
      launchDateRaw: 'March 28th',
      launchType: 'presale',
      website: 'solrise.finance',
      chain: 'Solana',
      confidence: { projectName: 0.95, launchDate: 0.85, chain: 0.9 },
    });
    mockProfileLookup();

    const tweet2 = makeTierCPayload('solrise_finance', {
      text: 'Solrise Finance presale opens March 28th on Solana. Whitelist now at solrise.finance',
      author: {
        userName: 'solrise_finance',
        name: 'Solrise Finance',
        description: 'Building on Solana',
        followers: 800,
      },
    });

    await sendTweet(tweet2);
    await waitForQueueDrain([enrichmentQueue], 15000);

    const countAfterTweet2 = await prisma.launchRecord.count({
      where: { twitterHandle: 'solrise_finance' },
    });
    expect(countAfterTweet2).toBe(1);

    record = (await findLaunchByHandle('solrise_finance'))!;
    expect(record).toBeTruthy();

    expect(['PARTIAL', 'CONFIRMED', 'VERIFIED']).toContain(record.status);

    expect(record.launchDate).toBeTruthy();

    expect(record.website).toBe('https://solrise.finance');

    signals = await getTweetSignals(record.id);
    expect(signals).toHaveLength(2);

    // === Tweet 3 (Tier C — launch day confirmation) ===
    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();
    mockExtractor({
      projectName: 'Solrise Finance',
      ticker: 'SLRS',
      launchType: 'tge',
      chain: 'Solana',
      launchDate: '2025-03-28T00:00:00Z',
      website: 'solrise.finance',
      confidence: {
        projectName: 0.98,
        ticker: 0.95,
        launchDate: 0.95,
        chain: 0.95,
      },
    });
    mockProfileLookup();

    const tweet3 = makeTierCPayload('solrise_finance', {
      text: '🚀 Solrise Finance is LIVE. $SLRS token now available. 4200 followers strong!',
      author: {
        userName: 'solrise_finance',
        name: 'Solrise Finance',
        description: 'Building on Solana',
        followers: 4200,
      },
    });

    await sendTweet(tweet3);
    await waitForQueueDrain([enrichmentQueue], 15000);

    const countAfterTweet3 = await prisma.launchRecord.count({
      where: { twitterHandle: 'solrise_finance' },
    });
    expect(countAfterTweet3).toBe(1);

    record = (await findLaunchByHandle('solrise_finance'))!;
    expect(record.ticker).toBe('SLRS');
    expect(record.confidenceScore).toBeGreaterThanOrEqual(0.7);

    signals = await getTweetSignals(record.id);
    expect(signals).toHaveLength(3);

    const sources = await getLaunchSources(record.id);
    expect(sources.length).toBeGreaterThanOrEqual(3);
  });
});
