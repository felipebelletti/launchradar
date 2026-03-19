import { RuleSource } from '@prisma/client';
import { prisma } from '../db/client.js';
import { ocrTweetImages } from '../ocr/image-ocr.js';
import { isLaunchAnnouncement, isCryptoRelated } from '../ai/classifier.js';
import { findExistingRecord } from './dedup.service.js';
import { enrichmentQueue } from '../queues/enrichment.queue.js';
import { accountMonitorQueue } from '../queues/account-monitor.queue.js';
import { createChildLogger } from '../logger.js';
import type { TweetData } from '../types/index.js';

const log = createChildLogger('ingest');

const TIER_A_LABELS = new Set([
  'chain_sol',
  'chain_eth',
  'chain_bsc',
  'chain_pump',
]);

const TIER_B_LABELS = new Set(['time_signals']);

function detectTier(ruleLabel: string): RuleSource {
  if (TIER_A_LABELS.has(ruleLabel)) return RuleSource.TIER_A;
  if (TIER_B_LABELS.has(ruleLabel)) return RuleSource.TIER_B;
  // Assume Tier C for per-account rules (format: "account_<handle>")
  return RuleSource.TIER_C;
}

function inferChainFromLabel(ruleLabel: string): string | null {
  const chainMap: Record<string, string> = {
    chain_sol: 'Solana',
    chain_eth: 'Ethereum',
    chain_bsc: 'BSC',
    chain_pump: 'Solana', // pump.fun is Solana-based
  };
  return chainMap[ruleLabel] ?? null;
}

/**
 * Main ingestion pipeline. Called from the webhook route.
 */
export async function ingestTweet(
  tweet: TweetData,
  ruleLabel: string
): Promise<void> {
  // Guard: skip retweets (should be filtered at rule level, but double-check)
  if (!tweet.id || !tweet.text) {
    log.warn('Received malformed tweet, skipping');
    return;
  }

  // Guard: dedup on tweet ID (twitterapi.io may deliver the same tweet twice)
  const existingSignal = await prisma.tweetSignal.findUnique({
    where: { tweetId: tweet.id },
  });
  if (existingSignal) {
    log.debug('Duplicate tweet, skipping', { tweetId: tweet.id });
    return;
  }

  const tier = detectTier(ruleLabel);

  // Step 1: OCR images — always runs first, before any AI stage
  let ocrText = '';
  if (tweet.imageUrls.length > 0) {
    try {
      ocrText = await ocrTweetImages(tweet.imageUrls);
    } catch (err) {
      log.warn('OCR failed for tweet images (non-fatal)', { err, tweetId: tweet.id });
    }
  }

  // Step 2: AI filters (Tier B only)
  if (tier === RuleSource.TIER_B) {
    const isLaunch = await isLaunchAnnouncement(tweet.text, ocrText);
    if (!isLaunch) {
      log.info('Tweet ranking: failed Stage 1 (not a launch)', {
        tweetId: tweet.id,
        authorHandle: tweet.authorHandle,
        stage: 'stage1_launch_filter',
        result: 'discard',
        tweetText: tweet.text,
      });
      return;
    }

    const isCrypto = await isCryptoRelated(tweet.text, tweet.authorBio, ocrText);
    if (!isCrypto) {
      log.info('Tweet ranking: failed Stage 2 (not crypto)', {
        tweetId: tweet.id,
        authorHandle: tweet.authorHandle,
        stage: 'stage2_crypto_filter',
        result: 'discard',
        tweetText: tweet.text,
      });
      return;
    }

    log.info('Tweet approved by classifier', {
      tweetId: tweet.id,
      authorHandle: tweet.authorHandle,
      tweetText: tweet.text,
    });
  }
  // Tier A: skip filters — chain already confirmed
  // Tier C: skip filters — account already confirmed crypto

  // Step 3: Dedup check — find existing LaunchRecord
  const existingRecord = await findExistingRecord(
    tweet.authorHandle,
    undefined, // projectName unknown at this stage
    undefined  // ticker unknown at this stage
  );

  // Step 4: Determine initial chain hint (for Tier A rules)
  const chainHint = tier === RuleSource.TIER_A ? inferChainFromLabel(ruleLabel) : null;

  // Step 5: Upsert LaunchRecord and create TweetSignal
  let launchRecordId: string;

  if (existingRecord) {
    // Merge into existing record: add tweet signal, potentially update confidence
    const tweetSignal = await prisma.tweetSignal.create({
      data: {
        tweetId: tweet.id,
        text: tweet.text,
        imageUrls: tweet.imageUrls,
        imageOcrText: ocrText || null,
        authorHandle: tweet.authorHandle,
        authorId: tweet.authorId,
        likes: tweet.likes,
        retweets: tweet.retweets,
        createdAt: tweet.createdAt,
        launchRecordId: existingRecord.id,
      },
    });

    // Also add a tweet source
    await prisma.launchSource.create({
      data: {
        type: 'TWEET',
        url: `https://twitter.com/${tweet.authorHandle}/status/${tweet.id}`,
        rawContent: tweet.text,
        launchRecordId: existingRecord.id,
      },
    });

    launchRecordId = existingRecord.id;
    log.info('Tweet merged into existing record', {
      tweetId: tweet.id,
      launchRecordId,
      signalId: tweetSignal.id,
      authorHandle: tweet.authorHandle,
    });

    // If this is a Tier C follow-up tweet, update lastTweetAt
    if (tier === RuleSource.TIER_C) {
      await prisma.monitoredAccount.updateMany({
        where: { twitterHandle: tweet.authorHandle },
        data: { lastTweetAt: new Date() },
      });
    }
  } else {
    // Create new stub LaunchRecord
    // Use authorHandle as placeholder project name — Stage 3 extractor will refine it
    const stubName = tweet.authorHandle;

    const launchRecord = await prisma.launchRecord.create({
      data: {
        projectName: stubName,
        twitterHandle: tweet.authorHandle,
        twitterFollowers: tweet.authorFollowers,
        isVerifiedAccount: tweet.authorIsVerified,
        chain: chainHint,
        ruleSource: tier,
        confidenceScore: tier === RuleSource.TIER_A ? 0.1 : 0,
        status: 'STUB',
        tweets: {
          create: {
            tweetId: tweet.id,
            text: tweet.text,
            imageUrls: tweet.imageUrls,
            imageOcrText: ocrText || null,
            authorHandle: tweet.authorHandle,
            authorId: tweet.authorId,
            likes: tweet.likes,
            retweets: tweet.retweets,
            createdAt: tweet.createdAt,
          },
        },
        sources: {
          create: {
            type: 'TWEET',
            url: `https://twitter.com/${tweet.authorHandle}/status/${tweet.id}`,
            rawContent: tweet.text,
          },
        },
      },
    });

    launchRecordId = launchRecord.id;
    log.info('Created new stub LaunchRecord', {
      launchRecordId,
      authorHandle: tweet.authorHandle,
      tier,
    });
  }

  // Step 6: Queue enrichment job (deduplicated by launchRecordId)
  await enrichmentQueue.add(
    'enrich-launch',
    { launchRecordId, twitterHandle: tweet.authorHandle },
    {
      jobId: launchRecordId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );

  // Step 7: Queue account monitor job (deduplicated by twitterHandle)
  // Skip if already a Tier C tweet (already monitoring this account)
  if (tier !== RuleSource.TIER_C) {
    await accountMonitorQueue.add(
      'register-account-monitor',
      { twitterHandle: tweet.authorHandle, launchRecordId },
      {
        jobId: tweet.authorHandle,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );
  }
}
