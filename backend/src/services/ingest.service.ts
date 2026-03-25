import crypto from 'node:crypto';
import { RuleSource } from '@prisma/client';
import { prisma } from '../db/client.js';
import { redis } from '../redis.js';
import { ocrTweetImages } from '../ocr/image-ocr.js';
import { isLaunchAnnouncement, isShillTweet, isCryptoRelated, classifyLaunchTiming } from '../ai/classifier.js';
import type { LaunchTiming } from '../ai/classifier.js';
import { isLikelyPriceRecapNotUpcomingLaunch } from '../ai/launch-signal-guard.js';
import { findExistingRecord } from './dedup.service.js';
import { enrichmentQueue } from '../queues/enrichment.queue.js';
import { registerAccountPolling } from '../queues/account-poll.queue.js';
import { publishEvent } from '../events/publisher.js';
import { createChildLogger } from '../logger.js';
import { tweetLogFields, tweetStatusUrl } from '../tweet-url.js';
import type { TweetData } from '../types/index.js';
import { initialTimeBadgeFromLaunchTiming, launchTimingToIngestTiming } from '../util/tweet-time-badge.js';

const log = createChildLogger('ingest');

const TIER_A_LABELS = new Set([
  'chain_sol',
  'chain_eth',
  'chain_bsc',
  'chain_pump',
  'token_ca',
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

  // Guard: skip tweets already discarded by AI filters (prevents re-running Stage 1/2)
  const DISCARD_KEY = 'discarded:tweet_ids';
  const alreadyDiscarded = await redis.sismember(DISCARD_KEY, tweet.id);
  if (alreadyDiscarded) {
    log.debug('Already discarded tweet, skipping', tweetLogFields(tweet.id, tweet.authorHandle));
    return;
  }

  // Guard: dedup on tweet ID (twitterapi.io may deliver the same tweet twice)
  const existingSignal = await prisma.tweetSignal.findUnique({
    where: { tweetId: tweet.id },
  });
  if (existingSignal) {
    log.debug('Duplicate tweet, skipping', tweetLogFields(tweet.id, tweet.authorHandle));
    return;
  }

  const tier = detectTier(ruleLabel);

  // Step 1: OCR images — always runs first, before any AI stage
  let ocrText = '';
  if (tweet.imageUrls.length > 0) {
    try {
      ocrText = await ocrTweetImages(tweet.imageUrls);
    } catch (err) {
      log.warn('OCR failed for tweet images (non-fatal)', {
        err,
        ...tweetLogFields(tweet.id, tweet.authorHandle),
      });
    }
  }

  const textForRecapGuard = [tweet.text, ocrText].filter(Boolean).join('\n');
  if (isLikelyPriceRecapNotUpcomingLaunch(textForRecapGuard)) {
    log.info('Tweet discarded: price recap / past launch heuristics', {
      ...tweetLogFields(tweet.id, tweet.authorHandle),
      authorHandle: tweet.authorHandle,
      tier,
    });
    await redis.sadd(DISCARD_KEY, tweet.id);
    await redis.expire(DISCARD_KEY, 60 * 60 * 24 * 3);
    return;
  }

  // Step 2: AI filters — Stage 1 (launch check) runs on ALL tiers; Stage 2 (crypto) on Tier B only

  // Stage 1: Is this a launch announcement? (all tiers)
  const isLaunch = await isLaunchAnnouncement(tweet.text, ocrText);
  if (!isLaunch) {
    log.info('Tweet ranking: failed Stage 1 (not a launch)', {
      ...tweetLogFields(tweet.id, tweet.authorHandle),
      authorHandle: tweet.authorHandle,
      stage: 'stage1_launch_filter',
      result: 'discard',
      tweetText: tweet.text,
      tier,
    });
    await redis.sadd(DISCARD_KEY, tweet.id);
    await redis.expire(DISCARD_KEY, 60 * 60 * 24 * 3);
    return;
  }

  // Shill detection: runs on ALL tiers
  const isShill = await isShillTweet(tweet.text, ocrText, tweet.authorHandle, tweet.authorBio, tweet.authorFollowers);
  if (isShill) {
    log.info('Shill tweet discarded', {
      ...tweetLogFields(tweet.id, tweet.authorHandle),
      authorHandle: tweet.authorHandle,
      tier,
    });
    await redis.sadd(DISCARD_KEY, tweet.id);
    await redis.expire(DISCARD_KEY, 60 * 60 * 24 * 3);
    return;
  }

  // Stage 2: Crypto relevance (Tier B only — Tier A is chain-qualified, Tier C is already confirmed)
  if (tier === RuleSource.TIER_B) {
    const isCrypto = await isCryptoRelated(tweet.text, tweet.authorBio, ocrText);
    if (!isCrypto) {
      log.info('Tweet ranking: failed Stage 2 (not crypto)', {
        ...tweetLogFields(tweet.id, tweet.authorHandle),
        authorHandle: tweet.authorHandle,
        stage: 'stage2_crypto_filter',
        result: 'discard',
        tweetText: tweet.text,
      });
      await redis.sadd(DISCARD_KEY, tweet.id);
      await redis.expire(DISCARD_KEY, 60 * 60 * 24 * 3);
      return;
    }
  }

  log.info('Tweet classified as crypto launch', {
    ...tweetLogFields(tweet.id, tweet.authorHandle),
    authorHandle: tweet.authorHandle,
    tweetText: tweet.text,
    stage1: 'pass',
    stage2: tier === RuleSource.TIER_B ? 'pass' : 'skip (crypto-confirmed)',
    tier,
    ...(tier === RuleSource.TIER_A ? { chain: inferChainFromLabel(ruleLabel) } : {}),
  });

  // Step 2b: Classify launch timing (future vs live) — runs after crypto filter passes
  const timing: LaunchTiming = await classifyLaunchTiming(tweet.text, ocrText);
  log.debug('Launch timing classified', { ...tweetLogFields(tweet.id, tweet.authorHandle), timing });

  const ingestTiming = launchTimingToIngestTiming(timing);
  const { timeBadge: initialTimeBadge, timeBadgeDetail: initialTimeBadgeDetail } =
    initialTimeBadgeFromLaunchTiming(timing);

  // Step 2c: Content-hash dedup — same tweet text = same signal, regardless of author
  const contentHash = crypto
    .createHash('sha256')
    .update(tweet.text.trim().toLowerCase())
    .digest('hex');

  const hashKey = `tweet:content_hash:${contentHash}`;
  const existingRecordIdByHash = await redis.get(hashKey);

  if (existingRecordIdByHash) {
    // Check if the original tweet was from a different author — that's a shill campaign
    const originalAuthor = await redis.get(`tweet:content_hash_author:${contentHash}`);
    if (originalAuthor && originalAuthor !== tweet.authorHandle) {
      log.info('Cross-author duplicate content detected, discarding as coordinated shill', {
        ...tweetLogFields(tweet.id, tweet.authorHandle),
        originalAuthor,
        existingRecordId: existingRecordIdByHash,
      });
      await redis.sadd(DISCARD_KEY, tweet.id);
      await redis.expire(DISCARD_KEY, 60 * 60 * 24 * 3);
      return;
    }

    // Same author, same content — merge into existing record
    const hashTarget = await prisma.launchRecord.findUnique({
      where: { id: existingRecordIdByHash },
      select: { id: true },
    });

    if (hashTarget) {
      log.debug('Duplicate tweet content from same author, merging signal', {
        ...tweetLogFields(tweet.id, tweet.authorHandle),
        existingRecordId: existingRecordIdByHash,
      });

      await prisma.tweetSignal.create({
        data: {
          tweetId: tweet.id,
          text: tweet.text,
          authorHandle: tweet.authorHandle,
          authorId: tweet.authorId,
          likes: tweet.likes,
          retweets: tweet.retweets,
          createdAt: tweet.createdAt,
          launchRecordId: existingRecordIdByHash,
          imageUrls: tweet.imageUrls,
          imageOcrText: ocrText || null,
          ingestTiming,
          timeBadge: initialTimeBadge,
          timeBadgeDetail: initialTimeBadgeDetail,
        },
      });

      return;
    }

    // Record gone — clear stale hash and continue with normal flow
    await redis.del(hashKey);
  }

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
        ingestTiming,
        timeBadge: initialTimeBadge,
        timeBadgeDetail: initialTimeBadgeDetail,
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

    // Store content hash pointing to this record (7-day TTL)
    await redis.set(hashKey, launchRecordId, 'EX', 60 * 60 * 24 * 7);
    await redis.set(`tweet:content_hash_author:${contentHash}`, tweet.authorHandle, 'EX', 60 * 60 * 24 * 7);

    log.info('Tweet merged into existing record', {
      ...tweetLogFields(tweet.id, tweet.authorHandle),
      launchRecordId,
      signalId: tweetSignal.id,
      authorHandle: tweet.authorHandle,
    });

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
            ingestTiming,
            timeBadge: initialTimeBadge,
            timeBadgeDetail: initialTimeBadgeDetail,
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

    // Store content hash pointing to this record (7-day TTL)
    await redis.set(hashKey, launchRecordId, 'EX', 60 * 60 * 24 * 7);
    await redis.set(`tweet:content_hash_author:${contentHash}`, tweet.authorHandle, 'EX', 60 * 60 * 24 * 7);

    log.info('Created new stub LaunchRecord', {
      launchRecordId,
      authorHandle: tweet.authorHandle,
      tier,
    });

    await publishEvent({
      type: 'launch:new',
      payload: {
        ...launchRecord,
        sourceTweetUrl: tweetStatusUrl(tweet.authorHandle, tweet.id),
      },
    });
  }

  // Step 6: Queue enrichment job
  // Use launchRecordId + tweetId to allow re-enrichment when new tweets arrive
  await enrichmentQueue.add(
    'enrich-launch',
    { launchRecordId, twitterHandle: tweet.authorHandle, timing, triggerTweetId: tweet.id },
    {
      jobId: `${launchRecordId}_${tweet.id}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );

  // Step 7: Register account for polling (deduplicated — skips if already monitored)
  // Skip if already a Tier C tweet (already monitoring this account)
  if (tier !== RuleSource.TIER_C) {
    const existingMonitor = await prisma.monitoredAccount.findUnique({
      where: { twitterHandle: tweet.authorHandle },
    });

    if (!existingMonitor) {
      await prisma.monitoredAccount.create({
        data: {
          twitterHandle: tweet.authorHandle,
          active: true,
          activatedAt: new Date(),
          launchRecordId,
        },
      });

      await registerAccountPolling(tweet.authorHandle);
      log.info('Registered account for polling', { twitterHandle: tweet.authorHandle });
    }
  }
}
