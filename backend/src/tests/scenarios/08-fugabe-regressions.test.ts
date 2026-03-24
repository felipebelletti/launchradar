import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { Worker } from 'bullmq';

import '../helpers/ocr-mock.js';
import {
  mockStage1Yes,
  mockStage1No,
  mockShillNo,
  mockShillYes,
  mockStage2Yes,
  mockTimingLive,
  mockTimingFuture,
  mockExtractor,
  getAiCallLog,
  getRemainingQueuedResponses,
} from '../helpers/ai-mock.js';
import { makeTierBPayload } from '../helpers/fixtures.js';
import {
  waitForLaunchRecord,
  findLaunchByHandle,
  waitForQueueDrain,
} from '../helpers/db-helpers.js';
import { ingestTweet } from '../../services/ingest.service.js';
import { enrichLaunch } from '../../services/enrichment.service.js';
import { getBullMQConnection } from '../../redis.js';
import { enrichmentQueue } from '../../queues/enrichment.queue.js';
import type { EnrichmentJobData } from '../../types/index.js';

/**
 * Regression tests from @fugabe profile audit (2026-03-24).
 *
 * Tweet 2: "$FUGABE AIRDROP LIVE" — a currently-live airdrop with 24hr window.
 *   Stage 1 was rejecting it because the prompt only accepted FUTURE launches.
 *   Fix: Stage 1 now accepts currently-live launch events too.
 *
 * Tweet 6: "#FUGABE airdrop on Monday: RT & Drop your Wallet" — project's own
 *   account announcing their airdrop. Shill detector false-positived on the
 *   engagement farming language.
 *   Fix: Shill prompt now explicitly allows engagement farming from project's own account.
 */
describe('Scenario 8: Fugabe Regressions — Live Airdrops & Shill False Positives', () => {
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

  it('8a - Live airdrop passes Stage 1 (not rejected as "already happened")', async () => {
    // Pipeline: Stage 1 YES → Shill NO → Stage 2 YES → Timing LIVE → Extraction
    mockStage1Yes();
    mockShillNo();
    mockStage2Yes();
    mockTimingLive();
    mockExtractor({
      projectName: 'FUGABE',
      ticker: 'FUGABE',
      launchType: 'airdrop',
      categories: ['Airdrop', 'Meme'],
      primaryCategory: 'Airdrop',
    });

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: 'fugabe' })
      .reply(200, {
        data: {
          id: 'user_fugabe',
          userName: 'fugabe',
          name: 'FUGABE',
          description: 'fugazzas cancelled will the 2 golden steaks be free?',
          followers: 50000,
          following: 100,
          isBlueVerified: false,
        },
      });

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: '$FUGABE AIRDROP LIVE:\n\nhttps://t.co/BmNhw1GqPb\n\nyou have 24hrs',
      author: {
        userName: 'fugabe',
        description: 'fugazzas cancelled will the 2 golden steaks be free?',
        followers: 50000,
      },
    });

    await ingestTweet(tweetData, ruleLabel);
    await waitForLaunchRecord('fugabe');
    await waitForQueueDrain([enrichmentQueue], 15000);

    const record = await findLaunchByHandle('fugabe');
    expect(record).toBeTruthy();
    expect(record!.projectName).toBe('FUGABE');

    // Verify Stage 1 was called and passed
    const calls = getAiCallLog();
    const stage1Calls = calls.filter(c =>
      c.userContent.includes('announce, tease, or describe a specific crypto go-live event')
    );
    expect(stage1Calls.length).toBeGreaterThanOrEqual(1);
  });

  it('8b - Project own-account airdrop with engagement farming is NOT shill', async () => {
    // This tweet uses "RT & Drop your Wallet" but is from the project's own account.
    // Pipeline: Stage 1 YES → Shill NO → Stage 2 YES → Timing FUTURE → Extraction
    mockStage1Yes();
    mockShillNo();
    mockStage2Yes();
    mockTimingFuture();
    mockExtractor({
      projectName: 'FUGABE',
      ticker: 'FUGABE',
      launchType: 'airdrop',
      launchDateRaw: 'Monday',
      categories: ['Airdrop', 'Meme'],
      primaryCategory: 'Airdrop',
    });

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: 'fugabe_project' })
      .reply(200, {
        data: {
          id: 'user_fugabe_2',
          userName: 'fugabe_project',
          name: 'FUGABE',
          description: 'Official FUGABE account',
          followers: 50000,
          following: 100,
          isBlueVerified: false,
        },
      });

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: '#FUGABE airdrop on Monday:\n\nWen Wallet Cheaker? More info\n\nRT & Drop your Wallet: https://t.co/NGIxcv7Hpi',
      author: {
        userName: 'fugabe_project',
        description: 'Official FUGABE account',
        followers: 50000,
      },
    });

    await ingestTweet(tweetData, ruleLabel);
    await waitForLaunchRecord('fugabe_project');
    await waitForQueueDrain([enrichmentQueue], 15000);

    const record = await findLaunchByHandle('fugabe_project');
    expect(record).toBeTruthy();
    expect(record!.projectName).toBe('FUGABE');

    // Verify shill check was called but didn't block
    const calls = getAiCallLog();
    const shillCalls = calls.filter(c => c.userContent.includes('shill, bot-bait, or spam'));
    expect(shillCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('8c - Actual shill tweets are still rejected', async () => {
    // Ensure the shill detector still catches real shills:
    // a gems/alpha account promoting another project
    mockStage1Yes();
    mockShillYes();

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: '🚨 ALPHA CALL 🚨\n\n$SCAMTOKEN launching on Solana\nDon\'t sleep on this one\n\n@ScamProject | #Solana | #100x\n\nNFA DYOR',
      author: {
        userName: 'crypto_gems_alpha',
        description: '💎 Best crypto gems | Alpha calls daily | NFA',
        followers: 25000,
      },
    });

    await ingestTweet(tweetData, ruleLabel);

    // Wait a bit — the tweet should NOT create a record
    await new Promise(r => setTimeout(r, 2000));

    const record = await findLaunchByHandle('crypto_gems_alpha');
    expect(record).toBeNull();
    expect(getRemainingQueuedResponses()).toBe(0);
  });

  it('8d - Non-launch tweets are still rejected by Stage 1', async () => {
    // Whitelist/engagement farming with no launch info should still fail Stage 1
    mockStage1No();

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: 'Imagine waking up to 10 free fugazzas 🍕\n\nYou have 96hrs!\n\n++ apply whitelist\nhttps://t.co/NIwwNANCQ2',
      author: {
        userName: 'fugabe_whitelist',
        description: 'fugazzas',
        followers: 50000,
      },
    });

    await ingestTweet(tweetData, ruleLabel);

    await new Promise(r => setTimeout(r, 2000));

    const record = await findLaunchByHandle('fugabe_whitelist');
    expect(record).toBeNull();
    expect(getRemainingQueuedResponses()).toBe(0);
  });

  it('8e - Third-party user reposting TGE info is rejected as shill', async () => {
    // Random user (@AbdulHa87710579, 382 followers) rephrasing WandrLust's $AFK TGE details
    mockStage1Yes();
    mockShillYes();

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: '$AFK is built on Base.\n\nFast, low-cost onchain infrastructure for the WandrLust app infrastructure.\n\n$AFK is the incentive mechanism and token enabling the Presence Economy.\n\nTGE: 25 March\n\nMore launch details soon!',
      author: {
        userName: 'AbdulHa87710579',
        description: '@CNPYNetwork EmoFi',
        followers: 382,
      },
    });

    await ingestTweet(tweetData, ruleLabel);

    await new Promise(r => setTimeout(r, 2000));

    const record = await findLaunchByHandle('AbdulHa87710579');
    expect(record).toBeNull();
    expect(getRemainingQueuedResponses()).toBe(0);
  });

  it('8f - Project own-account TGE announcement passes full pipeline', async () => {
    // WandrLust (@WandrLust_io, 73K followers) announcing their own $AFK TGE
    mockStage1Yes();
    mockShillNo();
    mockStage2Yes();
    mockTimingFuture();
    mockExtractor({
      projectName: 'WandrLust',
      ticker: 'AFK',
      chain: 'Base',
      launchType: 'tge',
      launchDate: '2026-03-25T00:00:00Z',
      launchDateRaw: '25th March',
      categories: ['Utility'],
      primaryCategory: 'Utility',
      summary: 'WandrLust is launching $AFK utility token on March 25th on Aerodrome DEX and MEXC CEX.',
    });

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: 'WandrLust_io' })
      .reply(200, {
        data: {
          id: 'user_wandrlust',
          userName: 'WandrLust_io',
          name: 'WandrLust',
          description: 'A mobile app that rewards real-life activity, built on-chain. Earn $AFK.',
          followers: 73700,
          following: 1052,
          isBlueVerified: true,
        },
      });

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: 'Excited to be working with @MEXC_Official as we prepare for the launch of $AFK on 25th March, the utility token powering the WandrLust Presence Economy.\n\nLaunch infrastructure includes Aerodrome (DEX) and MEXC (CEX).\n\nMore launch details coming soon. 🌍',
      author: {
        userName: 'WandrLust_io',
        description: 'A mobile app that rewards real-life activity, built on-chain. Earn $AFK.',
        followers: 73700,
      },
    });

    await ingestTweet(tweetData, ruleLabel);
    await waitForLaunchRecord('WandrLust_io');
    await waitForQueueDrain([enrichmentQueue], 15000);

    const record = await findLaunchByHandle('WandrLust_io');
    expect(record).toBeTruthy();
    expect(record!.projectName).toBe('WandrLust');
    expect(record!.chain).toBe('Base');
  });
});
