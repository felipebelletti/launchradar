import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { Worker } from 'bullmq';

import '../helpers/ocr-mock.js';
import {
  mockStage1Yes,
  mockShillNo,
  mockExtractor,
  mockTimingFuture,
  mockDisruptionPostponed,
  mockDisruptionCancelled,
  mockDisruptionNone,
  getAiCallLog,
} from '../helpers/ai-mock.js';
import { makeTierAPayload, makeTierCPayload } from '../helpers/fixtures.js';
import {
  waitForLaunchRecord,
  findLaunchByHandle,
  getTweetSignals,
  waitForQueueDrain,
  waitForStatus,
} from '../helpers/db-helpers.js';
import { ingestTweet } from '../../services/ingest.service.js';
import { enrichLaunch } from '../../services/enrichment.service.js';
import { checkAndHandleDisruption } from '../../ai/cancellation.js';
import { getBullMQConnection, redis } from '../../redis.js';
import { enrichmentQueue } from '../../queues/enrichment.queue.js';
import { prisma } from '../../db/client.js';
import type { EnrichmentJobData } from '../../types/index.js';

describe('Scenario 5: Disruption Detection', () => {
  let enrichmentWorker: Worker<EnrichmentJobData>;

  beforeAll(async () => {
    enrichmentWorker = new Worker<EnrichmentJobData>(
      'enrich-launch',
      async (job) => {
        const record = await prisma.launchRecord.findUnique({
          where: { id: job.data.launchRecordId },
          include: { tweets: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });

        if (!record) return;

        const latestTweet = record.tweets[0];
        if (latestTweet) {
          const disrupted = await checkAndHandleDisruption(latestTweet.text, record.id);
          if (disrupted) return;
        }

        await enrichLaunch(job.data.launchRecordId);
      },
      { connection: getBullMQConnection(), concurrency: 1 }
    );
  });

  afterAll(async () => {
    await enrichmentWorker.close();
  });

  function mockProfileForHandle(handle: string): void {
    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: handle })
      .reply(200, {
        id: `user_${handle}`,
        userName: handle,
        name: handle,
        description: 'DeFi protocol on Ethereum',
        website: `https://${handle}.io`,
        publicMetrics: { followersCount: 5000, followingCount: 300, tweetCount: 800 },
        isVerified: false,
        isBlueVerified: true,
      });
  }

  it('should transition a CONFIRMED record to CANCELLED on cancellation tweet', async () => {
    const HANDLE = 'cancelvault_team';

    // === Tweet 1 (Tier A — initial detection) ===
    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();
    mockDisruptionNone();
    mockExtractor({
      projectName: 'CancelVault',
      chain: 'Ethereum',
      launchDate: '2025-03-21T00:00:00Z',
      launchDateRaw: 'next Friday',
      launchType: 'mainnet',
      website: 'cancelvault.io',
      categories: ['Meme'],
      primaryCategory: 'Meme',
      confidence: {
        projectName: 0.95,
        chain: 0.95,
        launchDate: 0.85,
        website: 0.9,
      },
    });
    mockProfileForHandle(HANDLE);

    const tweet1 = makeTierAPayload('chain_eth', {
      text: 'CancelVault launching on Ethereum next Friday',
      author: {
        userName: HANDLE,
        name: 'CancelVault',
        description: 'DeFi protocol on Ethereum',
        followers: 5000,
        isBlueVerified: true,
      },
    });

    await ingestTweet(tweet1.tweetData, tweet1.ruleLabel);
    await waitForLaunchRecord(HANDLE);
    await waitForQueueDrain([enrichmentQueue], 15000);

    let record = (await findLaunchByHandle(HANDLE))!;
    expect(record.projectName).toBe('CancelVault');
    expect(['CONFIRMED', 'VERIFIED', 'PARTIAL']).toContain(record.status);

    // === Tweet 2 (Tier C — cancellation signal: project abandoned) ===
    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();
    mockDisruptionCancelled();

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: HANDLE })
      .optionally()
      .reply(200, {
        id: `user_${HANDLE}`,
        userName: HANDLE,
        name: 'CancelVault',
        description: 'DeFi protocol on Ethereum',
        publicMetrics: { followersCount: 5000, followingCount: 300, tweetCount: 800 },
      });

    const tweet2 = makeTierCPayload(HANDLE, {
      text: "CancelVault project has been shut down permanently. Team has disbanded.",
      author: {
        userName: HANDLE,
        name: 'CancelVault',
        description: 'DeFi protocol on Ethereum',
        followers: 5000,
      },
    });

    await ingestTweet(tweet2.tweetData, tweet2.ruleLabel);
    await waitForQueueDrain([enrichmentQueue], 15000);

    record = await waitForStatus(HANDLE, 'CANCELLED', 10000);
    expect(record.status).toBe('CANCELLED');

    const count = await prisma.launchRecord.count({
      where: { twitterHandle: HANDLE },
    });
    expect(count).toBe(1);

    const signals = await getTweetSignals(record.id);
    expect(signals).toHaveLength(2);
    expect(signals.some(s => s.text.includes('shut down'))).toBe(true);
  });

  it('should postpone (not cancel) a record when launch is delayed with TBD date', async () => {
    const HANDLE = 'metavault_team';

    // === Tweet 1 (Tier A — initial detection) ===
    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();
    mockDisruptionNone();
    mockExtractor({
      projectName: 'MetaVault',
      chain: 'Ethereum',
      launchDate: '2025-03-26T00:00:00Z',
      launchDateRaw: 'next Friday',
      launchType: 'mainnet',
      website: 'metavault.io',
      categories: ['Meme'],
      primaryCategory: 'Meme',
      confidence: {
        projectName: 0.95,
        chain: 0.95,
        launchDate: 0.85,
        website: 0.9,
      },
    });
    mockProfileForHandle(HANDLE);

    const tweet1 = makeTierAPayload('chain_eth', {
      text: 'MetaVault launching on Ethereum next Friday',
      author: {
        userName: HANDLE,
        name: 'MetaVault',
        description: 'DeFi protocol on Ethereum',
        followers: 5000,
        isBlueVerified: true,
      },
    });

    await ingestTweet(tweet1.tweetData, tweet1.ruleLabel);
    await waitForLaunchRecord(HANDLE);
    await waitForQueueDrain([enrichmentQueue], 15000);

    let record = (await findLaunchByHandle(HANDLE))!;
    expect(record.projectName).toBe('MetaVault');
    expect(['CONFIRMED', 'VERIFIED', 'PARTIAL']).toContain(record.status);
    expect(record.launchDate).toBeTruthy();

    const originalDate = record.launchDate;

    // === Tweet 2 (Tier C — postponement signal: delayed, not abandoned) ===
    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();
    mockDisruptionPostponed();

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: HANDLE })
      .optionally()
      .reply(200, {
        id: `user_${HANDLE}`,
        userName: HANDLE,
        name: 'MetaVault',
        description: 'DeFi protocol on Ethereum',
        publicMetrics: { followersCount: 5000, followingCount: 300, tweetCount: 800 },
      });

    const tweet2 = makeTierCPayload(HANDLE, {
      text: "We're postponing the MetaVault launch due to audit delays. New date TBD. Sorry everyone.",
      author: {
        userName: HANDLE,
        name: 'MetaVault',
        description: 'DeFi protocol on Ethereum',
        followers: 5000,
      },
    });

    await ingestTweet(tweet2.tweetData, tweet2.ruleLabel);
    await waitForQueueDrain([enrichmentQueue], 15000);

    // Wait a moment for the disruption handler to process
    await new Promise(r => setTimeout(r, 2000));

    record = (await findLaunchByHandle(HANDLE))!;

    // Should NOT be CANCELLED — it's postponed
    expect(record.status).not.toBe('CANCELLED');

    // Launch date should be cleared
    expect(record.launchDate).toBeNull();

    // Should have TBD marker
    expect(record.launchDateRaw).toBe('TBD (postponed)');

    // Should have rescheduledAt set
    expect(record.rescheduledAt).toBeTruthy();

    // Should preserve the old date
    if (originalDate) {
      expect(record.previousLaunchDate).toBeTruthy();
    }

    // Record should still be active (not cancelled)
    expect(['STUB', 'PARTIAL', 'CONFIRMED', 'VERIFIED']).toContain(record.status);

    const count = await prisma.launchRecord.count({
      where: { twitterHandle: HANDLE },
    });
    expect(count).toBe(1);

    const signals = await getTweetSignals(record.id);
    expect(signals).toHaveLength(2);
    expect(signals.some(s => s.text.includes('postponing'))).toBe(true);
  });

  it('should not disrupt a record when tweet has no disruption signal', async () => {
    const HANDLE = 'safevault_team';

    // === Tweet 1 (Tier A — initial detection) ===
    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();
    mockDisruptionNone();
    mockExtractor({
      projectName: 'SafeVault',
      chain: 'Ethereum',
      launchDate: '2025-03-28T00:00:00Z',
      launchDateRaw: 'next week',
      launchType: 'mainnet',
      website: 'safevault.io',
      categories: ['Meme'],
      primaryCategory: 'Meme',
      confidence: {
        projectName: 0.95,
        chain: 0.95,
        launchDate: 0.85,
        website: 0.9,
      },
    });
    mockProfileForHandle(HANDLE);

    const tweet1 = makeTierAPayload('chain_eth', {
      text: 'SafeVault launching on Ethereum next week',
      author: {
        userName: HANDLE,
        name: 'SafeVault',
        description: 'DeFi protocol on Ethereum',
        followers: 5000,
      },
    });

    await ingestTweet(tweet1.tweetData, tweet1.ruleLabel);
    await waitForLaunchRecord(HANDLE);
    await waitForQueueDrain([enrichmentQueue], 15000);

    let record = (await findLaunchByHandle(HANDLE))!;
    expect(['CONFIRMED', 'VERIFIED', 'PARTIAL']).toContain(record.status);
    const originalStatus = record.status;
    const originalDate = record.launchDate;

    // === Tweet 2 (Tier C — just a progress update, no disruption) ===
    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();
    mockDisruptionNone();
    mockExtractor({
      projectName: 'SafeVault',
      chain: 'Ethereum',
      launchDate: '2025-03-28T00:00:00Z',
      launchType: 'mainnet',
      website: 'safevault.io',
      categories: ['Meme'],
      primaryCategory: 'Meme',
      confidence: {
        projectName: 0.95,
        chain: 0.95,
        launchDate: 0.85,
        website: 0.9,
      },
    });

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: HANDLE })
      .optionally()
      .reply(200, {
        id: `user_${HANDLE}`,
        userName: HANDLE,
        name: 'SafeVault',
        publicMetrics: { followersCount: 5000 },
      });

    const tweet2 = makeTierCPayload(HANDLE, {
      text: 'SafeVault audit passed! On track for next week launch.',
      author: {
        userName: HANDLE,
        name: 'SafeVault',
        description: 'DeFi protocol on Ethereum',
        followers: 5000,
      },
    });

    await ingestTweet(tweet2.tweetData, tweet2.ruleLabel);
    await waitForQueueDrain([enrichmentQueue], 15000);

    record = (await findLaunchByHandle(HANDLE))!;

    // Should NOT be cancelled or postponed
    expect(record.status).not.toBe('CANCELLED');
    expect(record.rescheduledAt).toBeNull();
    expect(record.launchDate).toBeTruthy();
  });
});
