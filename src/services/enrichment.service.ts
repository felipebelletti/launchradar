import { LaunchStatus, RuleSource } from '@prisma/client';
import { prisma } from '../db/client.js';
import { extractLaunchData } from '../ai/extractor.js';
import { isLikelyPriceRecapNotUpcomingLaunch } from '../ai/launch-signal-guard.js';
import * as twitterApi from './twitterapi.service.js';
import { publishEvent } from '../events/publisher.js';
import { createChildLogger } from '../logger.js';
import { getPrimarySignalTweetUrlForLaunch } from '../tweet-url.js';
import type { ExtractionResult } from '../types/index.js';

function withoutRecapLaunchTiming(
  extraction: ExtractionResult,
  tweetText: string,
  ocrText: string,
): ExtractionResult {
  const blob = [tweetText, ocrText].filter(Boolean).join('\n');
  if (!isLikelyPriceRecapNotUpcomingLaunch(blob)) return extraction;
  return {
    ...extraction,
    launchDate: { value: null, confidence: 0 },
    launchDateRaw: { value: null, confidence: 0 },
  };
}

const log = createChildLogger('enrichment');

/**
 * Calculate confidence score based on available data.
 * See CLAUDE.md for the scoring formula.
 */
function calculateConfidenceScore(params: {
  hasProjectName: boolean;
  hasLaunchDateHighConfidence: boolean;
  hasChain: boolean;
  hasWebsite: boolean;
  hasFollowersOver500: boolean;
  isVerified: boolean;
  hasLaunchType: boolean;
  isTierA: boolean;
}): number {
  let score = 0;

  if (params.hasProjectName) score += 0.2;
  if (params.hasLaunchDateHighConfidence) score += 0.2;
  if (params.hasChain) score += 0.15;
  if (params.hasWebsite) score += 0.15;
  if (params.hasFollowersOver500) score += 0.1;
  if (params.isVerified) score += 0.1;
  if (params.hasLaunchType) score += 0.1;
  if (params.isTierA) score += 0.1;

  return Math.min(1, score);
}

function confidenceToStatus(score: number): LaunchStatus {
  if (score >= 0.9) return LaunchStatus.VERIFIED;
  if (score >= 0.7) return LaunchStatus.CONFIRMED;
  if (score >= 0.4) return LaunchStatus.PARTIAL;
  return LaunchStatus.STUB;
}

/**
 * Pull author profile from twitterapi.io and update the LaunchRecord.
 */
async function enrichWithProfile(
  launchRecordId: string,
  twitterHandle: string
): Promise<{
  bio: string;
  website?: string;
  followers: number;
  isVerified: boolean;
}> {
  const profile = await twitterApi.getUserInfo(twitterHandle);

  if (!profile) {
    return { bio: '', followers: 0, isVerified: false };
  }

  const followers = profile.publicMetrics?.followersCount ?? 0;
  const isVerified = profile.isVerified === true || profile.isBlueVerified === true;
  const website = profile.website ?? undefined;
  const bio = profile.description ?? '';

  // Store profile as a source
  await prisma.launchSource.create({
    data: {
      type: 'PROFILE',
      url: `https://twitter.com/${twitterHandle}`,
      rawContent: JSON.stringify(profile),
      launchRecordId,
    },
  });

  // Update basic profile fields
  await prisma.launchRecord.update({
    where: { id: launchRecordId },
    data: {
      twitterFollowers: followers,
      isVerifiedAccount: isVerified,
      website: website ?? undefined,
    },
  });

  return { bio, website, followers, isVerified };
}

/**
 * Apply extraction results to a LaunchRecord.
 */
async function applyExtractionResult(
  launchRecordId: string,
  extraction: ExtractionResult,
  profileData: { followers: number; isVerified: boolean; website?: string },
  isTierA: boolean
): Promise<void> {
  const projectName = extraction.projectName.value;
  const ticker = extraction.ticker.value;
  const chain = extraction.chain.value;
  const website = extraction.website.value ?? profileData.website ?? null;
  const launchType = extraction.launchType.value;
  const category = extraction.category.value;
  const launchDateRaw = extraction.launchDateRaw.value;
  const launchDateStr = extraction.launchDate.value;
  const launchDateConfidence = extraction.launchDate.confidence;

  let launchDate: Date | null = null;
  if (launchDateStr) {
    const parsed = new Date(launchDateStr);
    if (!isNaN(parsed.getTime())) {
      launchDate = parsed;
    }
  }

  const confidenceScore = calculateConfidenceScore({
    hasProjectName: !!projectName && extraction.projectName.confidence > 0.5,
    hasLaunchDateHighConfidence: !!launchDate && launchDateConfidence > 0.6,
    hasChain: !!chain,
    hasWebsite: !!website,
    hasFollowersOver500: profileData.followers > 500,
    isVerified: profileData.isVerified,
    hasLaunchType: !!launchType,
    isTierA,
  });

  const newStatus = confidenceToStatus(confidenceScore);

  log.info('Launch record confidence score', {
    launchRecordId,
    confidenceScore,
    newStatus,
    projectName,
    hasLaunchDate: !!launchDate,
    hasChain: !!chain,
    hasWebsite: !!website,
  });

  // Fetch the record before update to detect meaningful changes
  const before = await prisma.launchRecord.findUniqueOrThrow({
    where: { id: launchRecordId },
  });

  const updated = await prisma.launchRecord.update({
    where: { id: launchRecordId },
    data: {
      projectName: projectName ?? undefined,
      ticker: ticker ?? undefined,
      chain: chain ?? undefined,
      website: website ?? undefined,
      launchType: launchType ?? undefined,
      category: category ?? undefined,
      launchDateRaw: launchDateRaw ?? undefined,
      launchDate: launchDate ?? undefined,
      launchDateConfidence: launchDateConfidence > 0 ? launchDateConfidence : undefined,
      confidenceScore,
      status: newStatus,
    },
  });

  // Only publish when something meaningful changed
  const meaningful =
    updated.status !== before.status ||
    updated.confidenceScore !== before.confidenceScore ||
    updated.projectName !== before.projectName ||
    updated.launchDate?.getTime() !== before.launchDate?.getTime() ||
    updated.launchedAt?.getTime() !== before.launchedAt?.getTime() ||
    updated.chain !== before.chain;

  if (meaningful) {
    const sourceTweetUrl = await getPrimarySignalTweetUrlForLaunch(launchRecordId);
    await publishEvent({
      type: 'launch:updated',
      payload: { ...updated, sourceTweetUrl },
    });
  }
}

/**
 * Main enrichment function. Called by the enrichment worker.
 */
export async function enrichLaunch(
  launchRecordId: string,
  timing?: 'future' | 'live' | 'unknown'
): Promise<void> {
  const record = await prisma.launchRecord.findUnique({
    where: { id: launchRecordId },
    include: {
      tweets: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  if (!record) {
    log.warn('enrichLaunch: record not found', { launchRecordId });
    return;
  }

  if (!record.twitterHandle) {
    log.warn('enrichLaunch: record has no twitterHandle', { launchRecordId });
    return;
  }

  if (record.status === 'CANCELLED' || record.status === 'STALE') {
    log.debug('enrichLaunch: skipping cancelled/stale record', {
      launchRecordId,
      status: record.status,
    });
    return;
  }

  // Step 1: Pull author profile
  const profileData = await enrichWithProfile(launchRecordId, record.twitterHandle);

  // Step 2: Aggregate tweet text and OCR text for extraction
  const latestTweet = record.tweets[0];
  const tweetText = latestTweet?.text ?? '';
  const ocrText = latestTweet?.imageOcrText ?? '';

  // Step 2b: Handle LIVE timing — set status to LIVE, still extract fields if missing
  if (timing === 'live') {
    const needsExtraction = !record.projectName || record.projectName === record.twitterHandle
      || !record.chain || !record.category;

    const extractedData: Record<string, string> = {};

    if (needsExtraction) {
      const extraction = await extractLaunchData(tweetText, profileData.bio, ocrText);
      const candidates: Record<string, string | null | undefined> = {
        projectName: extraction.projectName.value,
        chain: extraction.chain.value,
        category: extraction.category.value,
        launchType: extraction.launchType.value,
        ticker: extraction.ticker.value,
        website: extraction.website.value ?? profileData.website,
      };
      for (const [key, val] of Object.entries(candidates)) {
        if (val) extractedData[key] = val;
      }
    }

    const before = await prisma.launchRecord.findUniqueOrThrow({
      where: { id: launchRecordId },
    });

    const updated = await prisma.launchRecord.update({
      where: { id: launchRecordId },
      data: {
        ...extractedData,
        status: 'LIVE',
        launchedAt: record.launchedAt ?? new Date(),
        confidenceScore: Math.max(record.confidenceScore, 0.75),
      },
    });

    const meaningful =
      updated.status !== before.status ||
      updated.confidenceScore !== before.confidenceScore ||
      updated.projectName !== before.projectName ||
      updated.launchDate?.getTime() !== before.launchDate?.getTime() ||
      updated.launchedAt?.getTime() !== before.launchedAt?.getTime() ||
      updated.chain !== before.chain;

    if (meaningful) {
      const sourceTweetUrl = await getPrimarySignalTweetUrlForLaunch(launchRecordId);
      await publishEvent({
        type: 'launch:updated',
        payload: { ...updated, sourceTweetUrl },
      });
    }

    log.info('Launch marked as LIVE', { launchRecordId, projectName: updated.projectName });
    return;
  }

  // Step 3: Run Stage 3 extractor (future / unknown timing — normal flow)
  const extraction = withoutRecapLaunchTiming(
    await extractLaunchData(tweetText, profileData.bio, ocrText),
    tweetText,
    ocrText,
  );

  // Step 4: Apply results and update state machine
  await applyExtractionResult(
    launchRecordId,
    extraction,
    profileData,
    record.ruleSource === RuleSource.TIER_A
  );
}
