import { describe, it, expect, beforeAll } from 'vitest';
import nock from 'nock';

import '../helpers/ocr-mock.js';
import {
  mockStage1Yes,
  mockShillNo,
  mockExtractor,
  mockTimingFuture,
} from '../helpers/ai-mock.js';
import { makeTierAPayload, makeTierCPayload } from '../helpers/fixtures.js';
import {
  findLaunchByHandle,
  resetTestData,
} from '../helpers/db-helpers.js';
import { ingestTweet } from '../../services/ingest.service.js';
import { enrichLaunch } from '../../services/enrichment.service.js';
import { prisma } from '../../db/client.js';

describe('Scenario 7: Reschedule Detection', () => {
  const HANDLE = 'aquaprotocol';

  function mockProfileLookup(handle: string = HANDLE): void {
    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: handle })
      .reply(200, {
        id: `user_${handle}`,
        userName: handle,
        name: 'Aqua Protocol',
        description: 'DeFi on Solana',
        website: 'https://aquaprotocol.xyz',
        publicMetrics: { followersCount: 2000, followingCount: 100, tweetCount: 500 },
        isVerified: false,
      });
  }

  beforeAll(async () => {
    await resetTestData();
  });

  it('should detect a reschedule when launch date moves by more than 30 minutes', async () => {
    // === Tweet 1: "launching in 1 hour" ===
    const originalDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();

    const tweet1 = makeTierAPayload('chain_sol', {
      text: 'Aqua Protocol launching on Solana in 1 hour! Get ready',
      author: {
        userName: HANDLE,
        name: 'Aqua Protocol',
        description: 'DeFi on Solana',
        followers: 2000,
      },
    });

    await ingestTweet(tweet1.tweetData, tweet1.ruleLabel);
    let record = (await findLaunchByHandle(HANDLE))!;
    expect(record).toBeTruthy();

    // Run enrichment directly (bypasses BullMQ worker timing issues)
    mockExtractor({
      projectName: 'Aqua Protocol',
      chain: 'Solana',
      launchDate: originalDate,
      launchDateRaw: 'in 1 hour',
      launchType: 'tge',
      website: 'aquaprotocol.xyz',
      confidence: { projectName: 0.95, chain: 0.9, launchDate: 0.85 },
    });
    mockProfileLookup();
    await enrichLaunch(record.id, 'future', tweet1.tweetData.id);

    record = (await findLaunchByHandle(HANDLE))!;
    expect(record.launchDate).toBeTruthy();
    expect(record.previousLaunchDate).toBeNull();
    expect(record.rescheduledAt).toBeNull();

    // === Tweet 2: "launching in 3 hours" (2 hours later = reschedule) ===
    const rescheduledDate = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();

    const tweet2 = makeTierCPayload(HANDLE, {
      text: 'Update: Aqua Protocol launch pushed to 3 hours from now. Minor delay, stay tuned!',
      author: {
        userName: HANDLE,
        name: 'Aqua Protocol',
        description: 'DeFi on Solana',
        followers: 2000,
      },
    });

    await ingestTweet(tweet2.tweetData, tweet2.ruleLabel);

    // Run enrichment directly with rescheduled date
    mockExtractor({
      projectName: 'Aqua Protocol',
      chain: 'Solana',
      launchDate: rescheduledDate,
      launchDateRaw: 'in 3 hours',
      launchType: 'tge',
      website: 'aquaprotocol.xyz',
      confidence: { projectName: 0.95, chain: 0.9, launchDate: 0.85 },
    });
    // Profile is on cooldown from first enrichment, make nock optional
    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: HANDLE })
      .optionally()
      .reply(200, {
        id: 'user_aqua',
        userName: HANDLE,
        name: 'Aqua Protocol',
        description: 'DeFi on Solana',
        publicMetrics: { followersCount: 2000 },
        isVerified: false,
      });
    await enrichLaunch(record.id, 'future', tweet2.tweetData.id);

    record = (await findLaunchByHandle(HANDLE))!;
    expect(record.rescheduledAt).toBeTruthy();
    expect(record.previousLaunchDate).toBeTruthy();

    const rescheduledSignal = await prisma.tweetSignal.findUnique({
      where: { tweetId: tweet2.tweetData.id },
    });
    expect(rescheduledSignal?.timeBadge).toBe('RESCHEDULED');

    // Previous date should match the original
    const prevDateMs = new Date(record.previousLaunchDate!).getTime();
    const origDateMs = new Date(originalDate).getTime();
    expect(Math.abs(prevDateMs - origDateMs)).toBeLessThan(5 * 60 * 1000);

    // Current date should match the rescheduled one
    const currentDateMs = new Date(record.launchDate!).getTime();
    const rescheduledDateMs = new Date(rescheduledDate).getTime();
    expect(Math.abs(currentDateMs - rescheduledDateMs)).toBeLessThan(5 * 60 * 1000);
  });

  it('should NOT flag as rescheduled when countdown reannouncement resolves to same time', async () => {
    const HANDLE2 = 'novafinance';

    // === Tweet 1: "launching in 1 hour" ===
    const targetDate = new Date(Date.now() + 60 * 60 * 1000);

    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();

    const tweet1 = makeTierAPayload('chain_sol', {
      text: 'Nova Finance mint goes live in 1 hour on Solana!',
      author: {
        userName: HANDLE2,
        name: 'Nova Finance',
        description: 'Yield on Solana',
        followers: 1500,
      },
    });

    await ingestTweet(tweet1.tweetData, tweet1.ruleLabel);
    let record = (await findLaunchByHandle(HANDLE2))!;
    expect(record).toBeTruthy();

    mockExtractor({
      projectName: 'Nova Finance',
      chain: 'Solana',
      launchDate: targetDate.toISOString(),
      launchDateRaw: 'in 1 hour',
      launchType: 'mint',
      confidence: { projectName: 0.9, chain: 0.9, launchDate: 0.8 },
    });
    mockProfileLookup(HANDLE2);
    await enrichLaunch(record.id, 'future', tweet1.tweetData.id);

    record = (await findLaunchByHandle(HANDLE2))!;
    expect(record.launchDate).toBeTruthy();
    expect(record.rescheduledAt).toBeNull();

    // === Tweet 2: "launching in 40 minutes" — same target time (+5 min drift) ===
    const reannounceDate = new Date(targetDate.getTime() + 5 * 60 * 1000);

    mockStage1Yes();
    mockShillNo();
    mockTimingFuture();

    const tweet2 = makeTierCPayload(HANDLE2, {
      text: 'Nova Finance mint in 40 minutes! Almost there',
      author: {
        userName: HANDLE2,
        name: 'Nova Finance',
        description: 'Yield on Solana',
        followers: 1500,
      },
    });

    await ingestTweet(tweet2.tweetData, tweet2.ruleLabel);

    mockExtractor({
      projectName: 'Nova Finance',
      chain: 'Solana',
      launchDate: reannounceDate.toISOString(),
      launchDateRaw: 'in 40 minutes',
      launchType: 'mint',
      confidence: { projectName: 0.9, chain: 0.9, launchDate: 0.8 },
    });
    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: HANDLE2 })
      .optionally()
      .reply(200, {
        id: 'user_nova',
        userName: HANDLE2,
        name: 'Nova Finance',
        publicMetrics: { followersCount: 1500 },
        isVerified: false,
      });
    await enrichLaunch(record.id, 'future', tweet2.tweetData.id);

    record = (await findLaunchByHandle(HANDLE2))!;
    // Should NOT be flagged — dates within 30 min of each other
    expect(record.rescheduledAt).toBeNull();
    expect(record.previousLaunchDate).toBeNull();

    const tweet2Signal = await prisma.tweetSignal.findUnique({
      where: { tweetId: tweet2.tweetData.id },
    });
    expect(tweet2Signal?.timeBadge).not.toBe('RESCHEDULED');
  });
});
