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
import { accountMonitorQueue } from '../../queues/account-monitor.queue.js';
import { RuleManagerService } from '../../services/rule-manager.service.js';
import { prisma } from '../../db/client.js';
import type { EnrichmentJobData, AccountMonitorJobData } from '../../types/index.js';

describe('Scenario 2: Tier A vs Tier B Routing', () => {
  let enrichmentWorker: Worker<EnrichmentJobData>;
  let accountMonitorWorker: Worker<AccountMonitorJobData>;
  let ruleManager: RuleManagerService;

  beforeAll(async () => {
    ruleManager = new RuleManagerService(redis);
    await redis.set('rule:active_count', '5');
    await redis.set('rule:max_rules', '50');

    enrichmentWorker = new Worker<EnrichmentJobData>(
      'enrich-launch',
      async (job) => { await enrichLaunch(job.data.launchRecordId); },
      { connection: getBullMQConnection(), concurrency: 1 }
    );

    accountMonitorWorker = new Worker<AccountMonitorJobData>(
      'register-account-monitor',
      async (job) => {
        await ruleManager.registerAccountMonitor(job.data.twitterHandle, job.data.launchRecordId);
      },
      { connection: getBullMQConnection(), concurrency: 1 }
    );
  });

  afterAll(async () => {
    await enrichmentWorker.close();
    await accountMonitorWorker.close();
  });

  it('2a - Tier A skips AI filters, goes straight to extraction', async () => {
    mockExtractor({
      projectName: 'DefiProjectXyz',
      chain: 'Solana',
      category: 'DeFi',
    });

    nock('https://twitterapi.io')
      .get('/api/twitter/user/info')
      .query({ userName: 'defi_project_xyz' })
      .reply(200, {
        id: 'user_xyz',
        userName: 'defi_project_xyz',
        name: 'DeFi Project XYZ',
        description: 'Building DeFi on Solana',
        publicMetrics: { followersCount: 200, followingCount: 50, tweetCount: 100 },
      });

    nock('https://twitterapi.io')
      .post('/api/webhook/rule')
      .reply(200, { id: 'rule_xyz', label: 'account_defi_project_xyz', filter: '', intervalSeconds: 120 });

    const { tweetData, ruleLabel } = makeTierAPayload('chain_sol', {
      text: 'Something big is coming 🚀',
      author: { userName: 'defi_project_xyz' },
    });

    await ingestTweet(tweetData, ruleLabel);

    await waitForLaunchRecord('defi_project_xyz');
    await waitForQueueDrain([enrichmentQueue, accountMonitorQueue], 15000);

    const calls = getAiCallLog();
    const haikuCalls = calls.filter(c => c.model === 'claude-haiku-4-5-20251001');
    expect(haikuCalls).toHaveLength(0);

    const sonnetCalls = calls.filter(c => c.model === 'claude-sonnet-4-6');
    expect(sonnetCalls.length).toBeGreaterThanOrEqual(1);

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

    nock('https://twitterapi.io')
      .get('/api/twitter/user/info')
      .query({ userName: 'crypto_launcher_b' })
      .reply(200, {
        id: 'user_b',
        userName: 'crypto_launcher_b',
        name: 'Crypto B',
        publicMetrics: { followersCount: 100, followingCount: 50, tweetCount: 50 },
      });

    nock('https://twitterapi.io')
      .post('/api/webhook/rule')
      .reply(200, { id: 'rule_b', label: 'account_crypto_launcher_b', filter: '', intervalSeconds: 120 });

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: 'launching soon — big crypto project!',
      author: { userName: 'crypto_launcher_b', description: 'Crypto enthusiast' },
    });

    await ingestTweet(tweetData, ruleLabel);

    await waitForLaunchRecord('crypto_launcher_b');
    await waitForQueueDrain([enrichmentQueue, accountMonitorQueue], 15000);

    const calls = getAiCallLog();
    const haikuCalls = calls.filter(c => c.model === 'claude-haiku-4-5-20251001');
    expect(haikuCalls.length).toBeGreaterThanOrEqual(2);

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
