import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nock from 'nock';
import { Worker } from 'bullmq';

import { getTesseractMock, mockOcrResult, mockOcrFailure } from '../helpers/ocr-mock.js';
import {
  mockStage1Yes,
  mockShillNo,
  mockStage2Yes,
  mockTimingFuture,
  mockExtractor,
  getAiCallLog,
} from '../helpers/ai-mock.js';
import { GROK_MODEL } from '../../ai/client.js';
import { makeTierBPayload } from '../helpers/fixtures.js';
import {
  waitForLaunchRecord,
  getTweetSignals,
  findLaunchByHandle,
  waitForQueueDrain,
} from '../helpers/db-helpers.js';
import { ingestTweet } from '../../services/ingest.service.js';
import { enrichLaunch } from '../../services/enrichment.service.js';
import { getBullMQConnection, redis } from '../../redis.js';
import { enrichmentQueue } from '../../queues/enrichment.queue.js';
import type { EnrichmentJobData } from '../../types/index.js';

describe('Scenario 3: OCR Provides the Crypto Signal', () => {
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

  it('3a - Image OCR text feeds into AI filters and extraction', async () => {
    const ocrContent = 'AquaFi Protocol\nBuilt on Solana\nPresale starts March 22nd\naquafi.io';

    mockOcrResult(ocrContent);

    mockStage1Yes();
    mockShillNo();
    mockStage2Yes();
    mockTimingFuture();
    mockExtractor({
      projectName: 'AquaFi',
      chain: 'Solana',
      launchDate: '2025-03-22T00:00:00Z',
      launchDateRaw: 'March 22nd',
      launchType: 'presale',
      website: 'aquafi.io',
    });

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: 'newproject_xyz' })
      .reply(200, {
        id: 'user_ocr',
        userName: 'newproject_xyz',
        name: 'New Project',
        description: 'Building the future',
        publicMetrics: { followersCount: 100, followingCount: 50, tweetCount: 20 },
      });

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: 'Something big is coming tomorrow 👀',
      author: {
        userName: 'newproject_xyz',
        name: 'New Project',
        description: 'Building the future',
      },
      photos: [{ url: 'https://pbs.twimg.com/media/abc123.jpg' }],
    });

    await ingestTweet(tweetData, ruleLabel);

    const record = await waitForLaunchRecord('newproject_xyz');
    await waitForQueueDrain([enrichmentQueue], 15000);

    const tesseractMock = getTesseractMock();
    expect(tesseractMock).toHaveBeenCalledWith(
      'https://pbs.twimg.com/media/abc123.jpg',
      'eng'
    );

    const calls = getAiCallLog();
    const grokCalls = calls.filter(c => c.model === GROK_MODEL);
    expect(grokCalls.some(c => c.userContent.includes('AquaFi Protocol'))).toBe(true);
    expect(grokCalls.some(c => c.userContent.includes('Built on Solana'))).toBe(true);

    const signals = await getTweetSignals(record.id);
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(signals[0].imageOcrText).toContain('AquaFi Protocol');

    const enrichedRecord = await findLaunchByHandle('newproject_xyz');
    expect(enrichedRecord).toBeTruthy();

    expect(enrichedRecord!.chain).toBe('Solana');

    expect(enrichedRecord!.launchDateRaw).toContain('March 22');
  });

  it('3b - OCR failure does not block the pipeline', async () => {
    mockOcrFailure(new Error('Tesseract timeout'));

    mockStage1Yes();
    mockShillNo();
    mockStage2Yes();
    mockTimingFuture();
    mockExtractor({
      projectName: 'FailOcrProject',
      chain: 'Ethereum',
    });

    nock('https://api.twitterapi.io')
      .get('/twitter/user/info')
      .query({ userName: 'fail_ocr_user' })
      .reply(200, {
        id: 'user_fail_ocr',
        userName: 'fail_ocr_user',
        name: 'Fail OCR',
        description: 'Crypto project with broken images',
        publicMetrics: { followersCount: 100, followingCount: 50, tweetCount: 10 },
      });

    const { tweetData, ruleLabel } = makeTierBPayload({
      text: 'launching soon — our new DeFi protocol on Ethereum!',
      author: {
        userName: 'fail_ocr_user',
        description: 'Crypto project with broken images',
      },
      photos: [{ url: 'https://pbs.twimg.com/media/broken_image.jpg' }],
    });

    await ingestTweet(tweetData, ruleLabel);

    const record = await waitForLaunchRecord('fail_ocr_user');
    await waitForQueueDrain([enrichmentQueue], 15000);

    const signals = await getTweetSignals(record.id);
    expect(signals.length).toBeGreaterThanOrEqual(1);
    const ocrText = signals[0].imageOcrText;
    expect(!ocrText || ocrText.length === 0).toBe(true);

    const calls = getAiCallLog();
    const grokCalls = calls.filter(c => c.model === GROK_MODEL);
    expect(grokCalls.length).toBeGreaterThanOrEqual(2);
  });
});
