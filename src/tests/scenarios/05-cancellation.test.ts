import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { Worker } from 'bullmq';

import '../helpers/ocr-mock.js';
import {
  mockExtractor,
  mockCancellationYes,
  mockCancellationNo,
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
import { isCancellationSignal } from '../../ai/cancellation.js';
import { getBullMQConnection, redis } from '../../redis.js';
import { enrichmentQueue } from '../../queues/enrichment.queue.js';
import { prisma } from '../../db/client.js';
import type { EnrichmentJobData } from '../../types/index.js';

describe('Scenario 5: Cancellation', () => {
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
          const isCancellation = await isCancellationSignal(latestTweet.text);
          if (isCancellation) {
            await prisma.launchRecord.update({
              where: { id: record.id },
              data: { status: 'CANCELLED' },
            });
            return;
          }
        }

        await enrichLaunch(job.data.launchRecordId);
      },
      { connection: getBullMQConnection(), concurrency: 1 }
    );
  });

  afterAll(async () => {
    await enrichmentWorker.close();
  });

  it('should transition a CONFIRMED record to CANCELLED on postponement tweet', async () => {
    // === Tweet 1 (Tier A — initial detection) ===
    mockCancellationNo();
    mockExtractor({
      projectName: 'MetaVault',
      chain: 'Ethereum',
      launchDate: '2025-03-21T00:00:00Z',
      launchDateRaw: 'next Friday',
      launchType: 'mainnet',
      website: 'metavault.io',
      category: 'DeFi',
      confidence: {
        projectName: 0.95,
        chain: 0.95,
        launchDate: 0.85,
        website: 0.9,
      },
    });

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: 'metavault_team' })
      .reply(200, {
        id: 'user_mv',
        userName: 'metavault_team',
        name: 'MetaVault',
        description: 'DeFi protocol on Ethereum',
        website: 'https://metavault.io',
        publicMetrics: { followersCount: 5000, followingCount: 300, tweetCount: 800 },
        isVerified: false,
        isBlueVerified: true,
      });

    const tweet1 = makeTierAPayload('chain_eth', {
      text: 'MetaVault launching on Ethereum next Friday',
      author: {
        userName: 'metavault_team',
        name: 'MetaVault',
        description: 'DeFi protocol on Ethereum',
        followers: 5000,
        isBlueVerified: true,
      },
    });

    await ingestTweet(tweet1.tweetData, tweet1.ruleLabel);

    await waitForLaunchRecord('metavault_team');
    await waitForQueueDrain([enrichmentQueue], 15000);

    let record = (await findLaunchByHandle('metavault_team'))!;
    expect(record.projectName).toBe('MetaVault');
    expect(['CONFIRMED', 'VERIFIED', 'PARTIAL']).toContain(record.status);

    // === Tweet 2 (Tier C — cancellation signal) ===
    mockCancellationYes();

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: 'metavault_team' })
      .optionally()
      .reply(200, {
        id: 'user_mv',
        userName: 'metavault_team',
        name: 'MetaVault',
        description: 'DeFi protocol on Ethereum',
        publicMetrics: { followersCount: 5000, followingCount: 300, tweetCount: 800 },
      });

    const tweet2 = makeTierCPayload('metavault_team', {
      text: "We're postponing the MetaVault launch due to audit delays. New date TBD. Sorry everyone.",
      author: {
        userName: 'metavault_team',
        name: 'MetaVault',
        description: 'DeFi protocol on Ethereum',
        followers: 5000,
      },
    });

    await ingestTweet(tweet2.tweetData, tweet2.ruleLabel);

    await waitForQueueDrain([enrichmentQueue], 15000);

    record = await waitForStatus('metavault_team', 'CANCELLED', 10000);
    expect(record.status).toBe('CANCELLED');

    const count = await prisma.launchRecord.count({
      where: { twitterHandle: 'metavault_team' },
    });
    expect(count).toBe(1);

    const signals = await getTweetSignals(record.id);
    expect(signals).toHaveLength(2);
    expect(signals.some(s => s.text.includes('postponing'))).toBe(true);

    const callsAfterTweet2 = getAiCallLog();
    const extractorCalls = callsAfterTweet2.filter(c => c.userContent.includes('Extract structured launch data'));
    expect(extractorCalls).toHaveLength(1);
  });
});
