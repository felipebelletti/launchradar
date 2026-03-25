import { LaunchStatus, RuleSource } from '@prisma/client';
import { prisma } from '../db/client.js';
import { extractLaunchData } from '../ai/extractor.js';
import { isLikelyPriceRecapNotUpcomingLaunch } from '../ai/launch-signal-guard.js';
import { findExistingRecordByExtraction } from './dedup.service.js';
import * as twitterApi from './twitterapi.service.js';
import { publishEvent } from '../events/publisher.js';
import { createChildLogger } from '../logger.js';
import { getPrimarySignalTweetUrlForLaunch } from '../tweet-url.js';
import { expandLaunchWebsite } from '../util/launch-website.js';
import { timeBadgeFromLaunchDate } from '../util/tweet-time-badge.js';
import { validatePlatforms } from '../platforms.js';
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
 * Convert a twitter handle into a readable project name fallback.
 * e.g. "aquafi_official" → "Aquafi Official"
 */
function handleToReadableName(handle: string): string {
  return handle
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Calculate confidence score based on available data.
 * See CLAUDE.md for the scoring formula.
 */
function calculateConfidenceScore(params: {
  hasProjectName: boolean;
  hasLaunchDateHighConfidence: boolean;
  hasPlatform: boolean;
  hasWebsite: boolean;
  hasFollowersOver500: boolean;
  isVerified: boolean;
  hasLaunchType: boolean;
  isTierA: boolean;
}): number {
  let score = 0;

  if (params.hasProjectName) score += 0.2;
  if (params.hasLaunchDateHighConfidence) score += 0.2;
  if (params.hasPlatform) score += 0.15;
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
  const website = await expandLaunchWebsite(profile.website);
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
      website,
    },
  });

  return { bio, website, followers, isVerified };
}

/**
 * Track unknown platform names suggested by the LLM for admin review.
 */
async function trackPlatformSuggestion(
  name: string,
  launchRecordId: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) return;

  try {
    await prisma.platformSuggestion.upsert({
      where: { name: trimmed },
      create: {
        name: trimmed,
        occurrences: 1,
        launchRecordIds: [launchRecordId],
        lastSeenAt: new Date(),
      },
      update: {
        occurrences: { increment: 1 },
        launchRecordIds: { push: launchRecordId },
        lastSeenAt: new Date(),
      },
    });
  } catch (err) {
    log.warn('Failed to track platform suggestion', { name: trimmed, err });
  }
}

/**
 * Validate platforms from extraction result against the canonical list.
 * Returns validated platforms and tracks unknown suggestions.
 */
async function validateAndTrackPlatforms(
  extraction: ExtractionResult,
  launchRecordId: string,
): Promise<{ platform: string | null; platforms: string[] }> {
  const rawPlatforms = extraction.platforms.value;
  const { platforms, unknown } = validatePlatforms(rawPlatforms);

  // Track unknown platforms from both the platforms array and suggestedPlatform field
  const allUnknown = [...unknown];
  if (extraction.suggestedPlatform.value) {
    allUnknown.push(extraction.suggestedPlatform.value);
  }

  for (const u of allUnknown) {
    await trackPlatformSuggestion(u, launchRecordId);
  }

  if (allUnknown.length > 0) {
    log.info('Unknown platforms suggested by LLM', {
      launchRecordId,
      unknown: allUnknown,
      validated: platforms,
    });
  }

  return {
    platform: platforms[0] ?? null,
    platforms,
  };
}

/**
 * Apply extraction results to a LaunchRecord.
 */
async function applyExtractionResult(
  launchRecordId: string,
  extraction: ExtractionResult,
  profileData: { followers: number; isVerified: boolean; website?: string },
  isTierA: boolean,
  triggerTweetId?: string
): Promise<{ rescheduled: boolean }> {
  // Fallback: if extraction didn't produce a projectName (null or very low confidence),
  // derive a readable name from the author handle so the record isn't nameless.
  // Confidence 0.25 ensures any real extraction in the future will override it.
  let projectName = extraction.projectName.value;
  let projectNameConfidence = extraction.projectName.confidence;
  const ticker = extraction.ticker.value;
  const { platform, platforms } = await validateAndTrackPlatforms(extraction, launchRecordId);
  const website =
    (await expandLaunchWebsite(extraction.website.value)) ??
    (await expandLaunchWebsite(profileData.website)) ??
    null;
  const launchType = extraction.launchType.value;
  const categories = extraction.categories.value;
  const primaryCategory = extraction.primaryCategory.value;
  const summary = extraction.summary.value;
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

  // Guard: if extraction returned essentially nothing (no project name, no chain, no date),
  // don't overwrite a record that already has higher confidence — the extractor likely failed
  // or the trigger tweet was a vague follow-up. Keep existing data.
  const before = await prisma.launchRecord.findUniqueOrThrow({
    where: { id: launchRecordId },
  });

  // Apply handle-based projectName fallback when extraction yielded nothing useful.
  // Only if the record doesn't already have a real (non-handle-placeholder) name.
  const hasRealProjectNameAlready =
    before.projectName && before.projectName !== before.twitterHandle;
  if (
    !hasRealProjectNameAlready &&
    (!projectName || projectNameConfidence < 0.4) &&
    before.twitterHandle
  ) {
    projectName = handleToReadableName(before.twitterHandle);
    projectNameConfidence = 0.25;
    log.info('Using handle-based projectName fallback', {
      launchRecordId,
      fallbackName: projectName,
    });
  }

  const extractionIsEmpty = !projectName && !platform && !launchDate && !launchType;
  if (extractionIsEmpty && before.confidenceScore > 0.3) {
    log.info('Skipping degraded extraction — would lower confidence on enriched record', {
      launchRecordId,
      existingConfidence: before.confidenceScore,
      existingStatus: before.status,
    });
    return { rescheduled: false };
  }

  const confidenceScore = calculateConfidenceScore({
    hasProjectName: !!projectName && extraction.projectName.confidence > 0.5,
    hasLaunchDateHighConfidence: !!launchDate && launchDateConfidence > 0.6,
    hasPlatform: !!platform,
    hasWebsite: !!website,
    hasFollowersOver500: profileData.followers > 500,
    isVerified: profileData.isVerified,
    hasLaunchType: !!launchType,
    isTierA,
  });

  // Guard: never lower confidence below the existing score. Enrichment should only improve.
  const finalConfidence = Math.max(confidenceScore, before.confidenceScore);
  const newStatus = confidenceToStatus(finalConfidence);

  log.info('Launch record confidence score', {
    launchRecordId,
    confidenceScore: finalConfidence,
    newStatus,
    projectName,
    hasLaunchDate: !!launchDate,
    hasPlatform: !!platform,
    platforms,
    hasWebsite: !!website,
  });

  // Guard: don't overwrite a high-confidence launch date with a lower-confidence one.
  // This prevents "snapshot in 12 hours" (confidence ~0.6) from replacing
  // "launching 24th March at 14:00 UTC" (confidence ~0.9).
  const existingDateConfidence = before.launchDateConfidence ?? 0;
  if (
    launchDate &&
    before.launchDate &&
    launchDateConfidence < existingDateConfidence &&
    existingDateConfidence >= 0.7
  ) {
    log.info('Skipping lower-confidence date overwrite', {
      launchRecordId,
      existingDate: before.launchDate.toISOString(),
      existingConfidence: existingDateConfidence,
      newDate: launchDate.toISOString(),
      newConfidence: launchDateConfidence,
    });
    launchDate = null;
  }

  // Detect reschedule: new date differs from existing date by more than 30 minutes.
  // This filters out "countdown reannouncements" where e.g. "launching in 1h" at 13:00
  // is followed by "launching in 30m" at 13:30 — both resolve to ~14:00.
  const RESCHEDULE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  let rescheduleData: { previousLaunchDate: Date; rescheduledAt: Date } | undefined;

  if (
    launchDate &&
    before.launchDate &&
    launchDateConfidence >= 0.6 &&
    Math.abs(launchDate.getTime() - before.launchDate.getTime()) > RESCHEDULE_THRESHOLD_MS
  ) {
    rescheduleData = {
      previousLaunchDate: before.launchDate,
      rescheduledAt: new Date(),
    };
    log.info('Launch date rescheduled', {
      launchRecordId,
      previousDate: before.launchDate.toISOString(),
      newDate: launchDate.toISOString(),
      diffMinutes: Math.round(Math.abs(launchDate.getTime() - before.launchDate.getTime()) / 60000),
    });
  }

  // Guard: don't overwrite projectName/ticker if the record already has real values
  // (i.e. not the twitterHandle placeholder or handle-derived fallback). This prevents
  // unrelated follow-up tweets from corrupting the record with a different project's name.
  const handleFallbackName = before.twitterHandle ? handleToReadableName(before.twitterHandle) : null;
  const hasRealProjectName = before.projectName
    && before.projectName !== before.twitterHandle
    && before.projectName !== handleFallbackName;
  const hasRealTicker = !!before.ticker;

  const updated = await prisma.launchRecord.update({
    where: { id: launchRecordId },
    data: {
      projectName: hasRealProjectName ? undefined : (projectName ?? undefined),
      ticker: hasRealTicker ? undefined : (ticker ?? undefined),
      chain: platform ?? undefined,
      platform: platform ?? undefined,
      platforms: platforms.length > 0 ? platforms : undefined,
      website: website ?? undefined,
      launchType: launchType ?? undefined,
      categories: categories.length > 0 ? categories : undefined,
      primaryCategory: primaryCategory ?? undefined,
      summary: summary ?? undefined,
      launchDateRaw: launchDateRaw ?? undefined,
      launchDate: launchDate ?? undefined,
      launchDateConfidence: launchDateConfidence > 0 ? launchDateConfidence : undefined,
      confidenceScore: finalConfidence,
      status: newStatus,
      ...rescheduleData,
    },
  });

  if (rescheduleData && triggerTweetId) {
    await prisma.tweetSignal.updateMany({
      where: { tweetId: triggerTweetId },
      data: { timeBadge: 'RESCHEDULED', timeBadgeDetail: null },
    });
  }

  // Only publish when something meaningful changed
  const meaningful =
    updated.status !== before.status ||
    updated.confidenceScore !== before.confidenceScore ||
    updated.projectName !== before.projectName ||
    updated.launchDate?.getTime() !== before.launchDate?.getTime() ||
    updated.launchedAt?.getTime() !== before.launchedAt?.getTime() ||
    updated.platform !== before.platform;

  if (meaningful) {
    const sourceTweetUrl = await getPrimarySignalTweetUrlForLaunch(launchRecordId);
    await publishEvent({
      type: 'launch:updated',
      payload: { ...updated, sourceTweetUrl },
    });
  }

  return { rescheduled: !!rescheduleData };
}

/**
 * Main enrichment function. Called by the enrichment worker.
 */
export async function enrichLaunch(
  launchRecordId: string,
  timing?: 'future' | 'live' | 'unknown',
  triggerTweetId?: string
): Promise<void> {
  const record = await prisma.launchRecord.findUnique({
    where: { id: launchRecordId },
    include: {
      tweets: { orderBy: { createdAt: 'desc' }, take: 25 },
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

  const resolvedTweet = triggerTweetId
    ? record.tweets.find((t) => t.tweetId === triggerTweetId) ??
      (await prisma.tweetSignal.findUnique({ where: { tweetId: triggerTweetId } }))
    : record.tweets[0];

  // Step 1: Pull author profile
  const profileData = await enrichWithProfile(launchRecordId, record.twitterHandle);

  // Step 2: Aggregate tweet text and OCR text for extraction
  const tweetText = resolvedTweet?.text ?? '';
  const ocrText = resolvedTweet?.imageOcrText ?? '';

  // Step 2b: Handle LIVE timing — set status to LIVE, still extract fields if missing
  if (timing === 'live') {
    if (triggerTweetId) {
      await prisma.tweetSignal.updateMany({
        where: { tweetId: triggerTweetId },
        data: { timeBadge: 'LIVE_NOW', timeBadgeDetail: null },
      });
    }

    const liveHandleFallback = record.twitterHandle ? handleToReadableName(record.twitterHandle) : null;
    const needsExtraction = !record.projectName
      || record.projectName === record.twitterHandle
      || record.projectName === liveHandleFallback
      || !record.platform || record.categories.length === 0;

    const extractedData: Record<string, string> = {};
    let extractedCategories: string[] | undefined;
    let validatedPlatforms: string[] = [];
    if (needsExtraction) {
      const extraction = await extractLaunchData(tweetText, profileData.bio, ocrText, undefined, resolvedTweet?.createdAt ?? undefined);
      const { platform: validatedPlatform, platforms: extractedPlatforms } =
        await validateAndTrackPlatforms(extraction, launchRecordId);
      validatedPlatforms = extractedPlatforms;
      const candidates: Record<string, string | null | undefined> = {
        projectName: extraction.projectName.value && extraction.projectName.confidence >= 0.4
          ? extraction.projectName.value
          : null,
        platform: validatedPlatform,
        chain: validatedPlatform,
        primaryCategory: extraction.primaryCategory.value,
        launchType: extraction.launchType.value,
        ticker: extraction.ticker.value,
        website:
          (await expandLaunchWebsite(extraction.website.value)) ??
          (await expandLaunchWebsite(profileData.website)),
      };

      // Apply handle-based fallback if extraction didn't produce a usable projectName
      // and the record doesn't already have a real name
      const hasRealName = record.projectName
        && record.projectName !== record.twitterHandle
        && record.projectName !== liveHandleFallback;
      if (!candidates.projectName && !hasRealName && record.twitterHandle) {
        candidates.projectName = handleToReadableName(record.twitterHandle);
      }

      for (const [key, val] of Object.entries(candidates)) {
        if (val) extractedData[key] = val;
      }
      if (extraction.categories.value.length > 0) {
        extractedCategories = extraction.categories.value;
      }
    }

    const before = await prisma.launchRecord.findUniqueOrThrow({
      where: { id: launchRecordId },
    });

    const launchedAt = record.launchedAt ?? new Date();
    const updated = await prisma.launchRecord.update({
      where: { id: launchRecordId },
      data: {
        ...extractedData,
        ...(validatedPlatforms.length > 0 ? { platforms: validatedPlatforms } : {}),
        ...(extractedCategories ? { categories: extractedCategories } : {}),
        status: 'LIVE',
        launchedAt,
        launchDate: record.launchDate ?? launchedAt,
        launchDateRaw: null,
        confidenceScore: Math.max(record.confidenceScore, 0.75),
      },
    });

    const meaningful =
      updated.status !== before.status ||
      updated.confidenceScore !== before.confidenceScore ||
      updated.projectName !== before.projectName ||
      updated.launchDate?.getTime() !== before.launchDate?.getTime() ||
      updated.launchedAt?.getTime() !== before.launchedAt?.getTime() ||
      updated.platform !== before.platform;

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
    await extractLaunchData(tweetText, profileData.bio, ocrText, undefined, resolvedTweet?.createdAt ?? undefined),
    tweetText,
    ocrText,
  );

  // Step 3b: Post-extraction dedup — check if another record exists for this project
  const duplicateOf = await findExistingRecordByExtraction(extraction);

  if (duplicateOf && duplicateOf.id !== launchRecordId) {
    log.info('Duplicate project detected — merging into existing record', {
      duplicateId: launchRecordId,
      existingId: duplicateOf.id,
      projectName: extraction.projectName.value,
    });

    await prisma.$transaction([
      prisma.tweetSignal.updateMany({
        where: { launchRecordId },
        data: { launchRecordId: duplicateOf.id },
      }),
      prisma.launchSource.updateMany({
        where: { launchRecordId },
        data: { launchRecordId: duplicateOf.id },
      }),
      // Re-point any MonitoredAccounts to the surviving record so they don't become orphaned
      prisma.monitoredAccount.updateMany({
        where: { launchRecordId },
        data: { launchRecordId: duplicateOf.id },
      }),
      prisma.launchRecord.delete({
        where: { id: launchRecordId },
      }),
    ]);

    // Re-run enrichment on the surviving record with merged data
    const { enrichmentQueue } = await import('../queues/enrichment.queue.js');
    await enrichmentQueue.add(
      'enrich-launch',
      {
        launchRecordId: duplicateOf.id,
        twitterHandle: duplicateOf.twitterHandle ?? record.twitterHandle!,
        timing,
        triggerTweetId,
      },
      { jobId: duplicateOf.id },
    );

    return;
  }

  // Step 4: Apply results and update state machine
  const { rescheduled } = await applyExtractionResult(
    launchRecordId,
    extraction,
    profileData,
    record.ruleSource === RuleSource.TIER_A,
    triggerTweetId
  );

  if (triggerTweetId && !rescheduled) {
    const launchDateStr = extraction.launchDate.value;
    const launchDateConfidence = extraction.launchDate.confidence;
    let parsedLaunch: Date | null = null;
    if (launchDateStr) {
      const p = new Date(launchDateStr);
      if (!isNaN(p.getTime())) parsedLaunch = p;
    }

    if (parsedLaunch && launchDateConfidence >= 0.6) {
      const { timeBadge, timeBadgeDetail } = timeBadgeFromLaunchDate(parsedLaunch);
      await prisma.tweetSignal.updateMany({
        where: { tweetId: triggerTweetId },
        data: { timeBadge, timeBadgeDetail },
      });
    } else {
      await prisma.tweetSignal.updateMany({
        where: { tweetId: triggerTweetId },
        data: { timeBadge: null, timeBadgeDetail: null },
      });
    }
  }
}
