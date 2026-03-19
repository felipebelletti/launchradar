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
import type { TestTweetPayload } from '../helpers/fixtures.js';
import {
  waitForLaunchRecord,
  findLaunchByHandle,
  getTweetSignals,
  waitForQueueDrain,
  countTweetSignalsByTweetId,
} from '../helpers/db-helpers.js';
import { ingestTweet } from '../../services/ingest.service.js';
import { enrichLaunch } from '../../services/enrichment.service.js';
import { getBullMQConnection, redis } from '../../redis.js';
import { enrichmentQueue } from '../../queues/enrichment.queue.js';
import { accountMonitorQueue } from '../../queues/account-monitor.queue.js';
import { RuleManagerService } from '../../services/rule-manager.service.js';
import { prisma } from '../../db/client.js';
import type { EnrichmentJobData, AccountMonitorJobData } from '../../types/index.js';

describe('Scenario 6: Deduplication', () => {
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

  function mockProfileForHandle(handle: string): void {
    nock('https://twitterapi.io')
      .get('/api/twitter/user/info')
      .query({ userName: handle })
      .reply(200, {
        id: `user_${handle}`,
        userName: handle,
        name: handle,
        description: 'Crypto account',
        publicMetrics: { followersCount: 200, followingCount: 50, tweetCount: 100 },
      });
  }

  function mockRuleCreation(): void {
    nock('https://twitterapi.io')
      .post('/api/webhook/rule')
      .reply(200, {
        id: `rule_${Date.now()}`,
        label: 'account_test',
        filter: '',
        intervalSeconds: 120,
      });
  }

  async function sendTweet(payload: TestTweetPayload): Promise<void> {
    await ingestTweet(payload.tweetData, payload.ruleLabel);
  }

  it('6a - Dedup by twitterHandle: multiple tweets from same author merge into one record', async () => {
    mockStage1Yes();
    mockStage2Yes();
    mockExtractor({ projectName: 'AquaFi', ticker: 'AQUA', chain: 'Solana' });
    mockProfileForHandle('aquafi_official');
    mockRuleCreation();

    const tweet1 = makeTierBPayload({
      text: 'AquaFi launching on Solana tomorrow 🌊',
      author: { userName: 'aquafi_official', description: 'DeFi protocol' },
    });

    await sendTweet(tweet1);
    await waitForLaunchRecord('aquafi_official');
    await waitForQueueDrain([enrichmentQueue, accountMonitorQueue], 15000);

    mockStage1Yes();
    mockStage2Yes();
    mockExtractor({ projectName: 'AquaFi', ticker: 'AQUA', chain: 'Solana' });
    mockProfileForHandle('crypto_influencer_99');
    mockRuleCreation();

    const tweet2 = makeTierBPayload({
      text: 'excited for @aquafi_official launch tomorrow on Solana $AQUA',
      author: { userName: 'crypto_influencer_99', description: 'Crypto influencer' },
    });

    await sendTweet(tweet2);
    await waitForLaunchRecord('crypto_influencer_99');
    await waitForQueueDrain([enrichmentQueue, accountMonitorQueue], 15000);

    mockStage1Yes();
    mockStage2Yes();
    mockExtractor({ projectName: 'AquaFi', chain: 'Solana' });
    mockProfileForHandle('sol_degen_trader');
    mockRuleCreation();

    const tweet3 = makeTierBPayload({
      text: 'just whitelisted for AquaFi presale launching on #Solana',
      author: { userName: 'sol_degen_trader', description: 'Solana degen' },
    });

    await sendTweet(tweet3);
    await waitForLaunchRecord('sol_degen_trader');
    await waitForQueueDrain([enrichmentQueue, accountMonitorQueue], 15000);

    const totalRecords = await prisma.launchRecord.count();
    expect(totalRecords).toBe(3);
  });

  it('6c - Same tweet delivered twice (idempotency)', async () => {
    mockStage1Yes();
    mockStage2Yes();
    mockExtractor({ projectName: 'DupeTest', chain: 'Ethereum' });
    mockProfileForHandle('dupe_test_user');
    mockRuleCreation();

    const payload = makeTierBPayload({
      tweetId: 'fixed_tweet_id_for_dedup_test',
      text: 'DupeTest launching on Ethereum soon!',
      author: { userName: 'dupe_test_user', description: 'Testing dedup' },
    });

    await sendTweet(payload);
    await waitForLaunchRecord('dupe_test_user');
    await waitForQueueDrain([enrichmentQueue, accountMonitorQueue], 15000);

    await ingestTweet(payload.tweetData, payload.ruleLabel);

    await new Promise(r => setTimeout(r, 1000));

    const signalCount = await countTweetSignalsByTweetId('fixed_tweet_id_for_dedup_test');
    expect(signalCount).toBe(1);

    const recordCount = await prisma.launchRecord.count({
      where: { twitterHandle: 'dupe_test_user' },
    });
    expect(recordCount).toBe(1);
  });

  it('6d - Different project, same author — both tweets ingested into same record (dedup by handle)', async () => {
    mockStage1Yes();
    mockStage2Yes();
    mockExtractor({ projectName: 'ProjectA', ticker: 'TKNA', chain: 'Solana' });
    mockProfileForHandle('multi_project_dev');
    mockRuleCreation();

    const tweet1 = makeTierBPayload({
      text: 'ProjectA ($TKNA) launching on Solana!',
      author: { userName: 'multi_project_dev', description: 'Building many things' },
    });

    await sendTweet(tweet1);
    await waitForLaunchRecord('multi_project_dev');
    await waitForQueueDrain([enrichmentQueue, accountMonitorQueue], 15000);

    mockStage1Yes();
    mockStage2Yes();
    mockExtractor({ projectName: 'ProjectB', ticker: 'TKNB', chain: 'Ethereum' });
    mockProfileForHandle('multi_project_dev');

    const tweet2 = makeTierBPayload({
      text: 'Also building ProjectB ($TKNB) on Ethereum!',
      author: { userName: 'multi_project_dev', description: 'Building many things' },
    });

    await sendTweet(tweet2);
    await new Promise(r => setTimeout(r, 500));
    await waitForQueueDrain([enrichmentQueue, accountMonitorQueue], 15000);

    const count = await prisma.launchRecord.count({
      where: { twitterHandle: 'multi_project_dev' },
    });
    expect(count).toBe(1);

    const record = await findLaunchByHandle('multi_project_dev');
    expect(record).toBeTruthy();
    const signals = await getTweetSignals(record!.id);
    expect(signals).toHaveLength(2);
  });

  it('6b - Multiple tweets from same handle merge into one record with all signals', async () => {
    mockStage1Yes();
    mockStage2Yes();
    mockExtractor({ projectName: 'AquaFi', ticker: 'AQUA', chain: 'Solana' });
    mockProfileForHandle('aqua_official_2');
    mockRuleCreation();

    const tweet1 = makeTierBPayload({
      text: 'AquaFi launching on Solana!',
      author: { userName: 'aqua_official_2', description: 'AquaFi team' },
    });

    await sendTweet(tweet1);
    await waitForLaunchRecord('aqua_official_2');
    await waitForQueueDrain([enrichmentQueue, accountMonitorQueue], 15000);

    mockStage1Yes();
    mockStage2Yes();
    mockExtractor({
      projectName: 'AquaFi Protocol',
      ticker: 'AQUA',
      chain: 'Solana',
      website: 'aquafi.io',
    });
    mockProfileForHandle('aqua_official_2');

    const tweet2 = makeTierBPayload({
      text: 'AquaFi Protocol presale is tomorrow!',
      author: { userName: 'aqua_official_2', description: 'AquaFi team' },
    });

    await sendTweet(tweet2);
    await new Promise(r => setTimeout(r, 500));
    await waitForQueueDrain([enrichmentQueue, accountMonitorQueue], 15000);

    const count = await prisma.launchRecord.count({
      where: { twitterHandle: 'aqua_official_2' },
    });
    expect(count).toBe(1);

    const record = await findLaunchByHandle('aqua_official_2');
    expect(record).toBeTruthy();

    const signals = await getTweetSignals(record!.id);
    expect(signals).toHaveLength(2);
  });
});
