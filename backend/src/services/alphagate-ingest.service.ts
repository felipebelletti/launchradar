import { prisma } from '../db/client.js';
import { redis } from '../redis.js';
import { findExistingRecord } from './dedup.service.js';
import { enrichmentQueue } from '../queues/enrichment.queue.js';
import { registerAccountPolling } from '../queues/account-poll.queue.js';
import { publishEvent } from '../events/publisher.js';
import { createChildLogger } from '../logger.js';
import type { AlphaGateProject } from './alphagate.service.js';

const PROCESSED_COUNT_KEY = 'alphagate:processed_count';
const LAST_PROCESSED_KEY = 'alphagate:last_processed';

const log = createChildLogger('alphagate-ingest');

// 7-day TTL for "already imported" guard
const IMPORT_TTL = 60 * 60 * 24 * 7;

// ─── Chain normalization ─────────────────────────────────

const CHAIN_ALIASES: Record<string, string> = {
  sol: 'Solana',
  solana: 'Solana',
  eth: 'Ethereum',
  ethereum: 'Ethereum',
  base: 'Base',
  bsc: 'BSC',
  bnb: 'BSC',
  binance: 'BSC',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
  avax: 'Avalanche',
  arbitrum: 'Arbitrum',
  optimism: 'Optimism',
};

function normalizeChain(raw: string): string {
  return CHAIN_ALIASES[raw.toLowerCase().trim()] ?? raw;
}

// ─── Tag → category mapping ─────────────────────────────

function tagsToCategory(tags: string[]): { primary: string | null; categories: string[] } {
  const categories: string[] = [];
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (lower === 'nft') categories.push('NFT');
    else if (lower === 'defi') categories.push('DeFi');
    else if (lower === 'gamefi' || lower === 'gaming') categories.push('GameFi');
    else if (lower === 'ai') categories.push('AI');
    else if (lower === 'meme' || lower === 'memecoin') categories.push('Meme');
    else if (lower !== 'launched') categories.push(tag);
  }
  return { primary: categories[0] ?? null, categories };
}

// ─── Main processing function ────────────────────────────

export async function processAlphaGateProject(
  project: AlphaGateProject
): Promise<void> {
  // Guard: skip unavailable accounts
  if (project.unavailable) {
    log.debug('Skipping unavailable project', { id: project._id, name: project.name });
    return;
  }

  // Guard: skip already-imported projects (Redis dedup, 7-day TTL)
  const importKey = `alphagate:imported:${project._id}`;
  const alreadyImported = await redis.get(importKey);
  if (alreadyImported) {
    log.debug('Already imported AlphaGate project, skipping', { id: project._id });
    return;
  }

  // Guard: skip already-launched projects (we track upcoming, not past)
  const hasLaunchedTag = project.tag.some((t) => t.toLowerCase() === 'launched');
  const hasDexscreener = project.dexscreener != null && Object.keys(project.dexscreener).length > 0;
  if (hasLaunchedTag || hasDexscreener) {
    log.debug('Skipping already-launched project', {
      id: project._id,
      name: project.name,
      reason: hasLaunchedTag ? 'tagged_launched' : 'has_dexscreener',
    });
    await redis.set(importKey, '1', 'EX', IMPORT_TTL);
    return;
  }

  const twitterHandle = project.username || null;
  const projectName = project.name || project.username;
  const chain = project.chain.length > 0 ? normalizeChain(project.chain[0]) : null;
  const { primary: primaryCategory, categories } = tagsToCategory(project.tag);
  const description = project.description || null;

  // Extract website from social links
  let website: string | null = null;
  if (project.social?.socials) {
    const webLink = project.social.socials.find(
      (s) => s.type === 'website' || s.type === 'web'
    );
    if (webLink?.url) website = webLink.url;
  }

  // Dedup: check if we already track this project
  const existingRecord = await findExistingRecord(
    twitterHandle ?? undefined,
    projectName,
    undefined
  );

  let launchRecordId: string;

  if (existingRecord) {
    // Merge: add AlphaGate as a source to the existing record
    const existingSource = await prisma.launchSource.findFirst({
      where: {
        launchRecordId: existingRecord.id,
        type: 'ALPHAGATE',
        url: `alphagate://${project._id}`,
      },
    });

    if (existingSource) {
      // Already have this exact source — just mark as imported and return
      await redis.set(importKey, '1', 'EX', IMPORT_TTL);
      return;
    }

    await prisma.launchSource.create({
      data: {
        type: 'ALPHAGATE',
        url: `alphagate://${project._id}`,
        rawContent: JSON.stringify(project),
        extractedData: {
          projectName,
          twitterHandle,
          chain,
          categories,
          primaryCategory,
          website,
          description,
          followersCount: project.followers_count,
          keyFollowersCount: project.key_followers_count,
        },
        launchRecordId: existingRecord.id,
      },
    });

    // Update fields that are currently missing on the record
    const updates: Record<string, unknown> = {};
    if (!existingRecord.chain && chain) updates.chain = chain;
    if (!existingRecord.website && website) updates.website = website;
    if (!existingRecord.summary && description) updates.summary = description;
    if (categories.length > 0 && existingRecord.categories.length === 0) {
      updates.categories = categories;
    }
    if (!existingRecord.primaryCategory && primaryCategory) {
      updates.primaryCategory = primaryCategory;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.launchRecord.update({
        where: { id: existingRecord.id },
        data: updates,
      });
    }

    launchRecordId = existingRecord.id;

    log.info('AlphaGate project merged into existing record', {
      alphaGateId: project._id,
      launchRecordId,
      projectName,
    });
  } else {
    // Create new LaunchRecord
    const launchRecord = await prisma.launchRecord.create({
      data: {
        projectName,
        twitterHandle,
        twitterFollowers: project.followers_count || null,
        chain,
        categories,
        primaryCategory,
        website,
        summary: description,
        ruleSource: 'TIER_A', // AlphaGate is curated — equivalent to chain-confirmed
        confidenceScore: 0.1,
        status: 'STUB',
        sources: {
          create: {
            type: 'ALPHAGATE',
            url: `alphagate://${project._id}`,
            rawContent: JSON.stringify(project),
            extractedData: {
              projectName,
              twitterHandle,
              chain,
              categories,
              primaryCategory,
              website,
              description,
              followersCount: project.followers_count,
              keyFollowersCount: project.key_followers_count,
            },
          },
        },
      },
    });

    launchRecordId = launchRecord.id;

    log.info('Created new LaunchRecord from AlphaGate', {
      alphaGateId: project._id,
      launchRecordId,
      projectName,
      chain,
    });

    await publishEvent({
      type: 'launch:new',
      payload: { ...launchRecord, sourceTweetUrl: null },
    });
  }

  // Mark as imported + track stats
  await redis.set(importKey, '1', 'EX', IMPORT_TTL);
  await redis.incr(PROCESSED_COUNT_KEY);
  await redis.set(LAST_PROCESSED_KEY, JSON.stringify({
    name: projectName,
    handle: twitterHandle,
    chain,
    at: new Date().toISOString(),
  }));

  // Queue enrichment if we have a twitter handle
  if (twitterHandle) {
    await enrichmentQueue.add(
      'enrich-launch',
      { launchRecordId, twitterHandle },
      {
        jobId: `ag_${launchRecordId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );

    // Register account for polling if not already monitored
    const existingMonitor = await prisma.monitoredAccount.findUnique({
      where: { twitterHandle },
    });

    if (!existingMonitor) {
      await prisma.monitoredAccount.create({
        data: {
          twitterHandle,
          active: true,
          activatedAt: new Date(),
          launchRecordId,
        },
      });

      await registerAccountPolling(twitterHandle);
      log.info('Registered AlphaGate account for polling', { twitterHandle });
    }
  }
}
