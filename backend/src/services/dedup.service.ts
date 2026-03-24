import { prisma } from '../db/client.js';
import type { LaunchRecord } from '@prisma/client';
import type { ExtractionResult } from '../types/index.js';

/**
 * Simple Levenshtein distance implementation for fuzzy project name matching.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

function isFuzzyMatch(a: string, b: string, threshold = 0.8): boolean {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return true;

  const maxLen = Math.max(aLower.length, bLower.length);
  if (maxLen === 0) return true;

  const distance = levenshtein(aLower, bLower);
  const similarity = 1 - distance / maxLen;

  return similarity >= threshold;
}

/**
 * Find an existing LaunchRecord that matches the given identifiers.
 * Checks in order:
 * 1. Twitter handle match (exact)
 * 2. Ticker match (case-insensitive exact)
 * 3. Project name fuzzy match (Levenshtein similarity >= 80%)
 */
export async function findExistingRecord(
  twitterHandle?: string,
  projectName?: string,
  ticker?: string
): Promise<LaunchRecord | null> {
  // 1. Exact twitter handle match
  if (twitterHandle) {
    const byHandle = await prisma.launchRecord.findFirst({
      where: {
        twitterHandle: {
          equals: twitterHandle,
          mode: 'insensitive',
        },
      },
    });
    if (byHandle) return byHandle;
  }

  // 2. Exact ticker match (case-insensitive)
  if (ticker) {
    const byTicker = await prisma.launchRecord.findFirst({
      where: {
        ticker: {
          equals: ticker,
          mode: 'insensitive',
        },
      },
    });
    if (byTicker) return byTicker;
  }

  // 3. Fuzzy project name match — load recent records and check in memory
  // For MVP this is acceptable; at scale, use pg_trgm extension
  if (projectName) {
    const recentRecords = await prisma.launchRecord.findMany({
      where: {
        // Only check records updated in the last 90 days to limit memory use
        updatedAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true, projectName: true },
    });

    for (const record of recentRecords) {
      if (isFuzzyMatch(record.projectName, projectName)) {
        // Re-fetch full record
        return prisma.launchRecord.findUnique({ where: { id: record.id } });
      }
    }
  }

  return null;
}

/**
 * Post-extraction dedup: after Stage 3 returns structured data, check if a
 * LaunchRecord already exists for the same project using extracted fields.
 *
 * Match priority (highest confidence first):
 * 1. Exact ticker match (case-insensitive) — most reliable
 * 2. Exact website domain match — very reliable
 * 3. Fuzzy project name match (Levenshtein distance ≤ threshold) — fallback
 */
export async function findExistingRecordByExtraction(
  extraction: ExtractionResult
): Promise<LaunchRecord | null> {
  const ticker = extraction.ticker.value?.toUpperCase() ?? null;
  const website = extraction.website.value?.toLowerCase() ?? null;
  const projectName = extraction.projectName.value ?? null;

  // Only run dedup if we extracted at least one identity signal
  if (!ticker && !website && !projectName) return null;

  // 1. Ticker match — strongest signal
  if (ticker && extraction.ticker.confidence >= 0.7) {
    const byTicker = await prisma.launchRecord.findFirst({
      where: {
        ticker: { equals: ticker, mode: 'insensitive' },
        status: { notIn: ['STALE', 'CANCELLED'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (byTicker) return byTicker;
  }

  // 2. Website match — extract domain for comparison
  if (website && extraction.website.confidence >= 0.6) {
    const domain = extractDomain(website);
    if (domain) {
      const byWebsite = await prisma.launchRecord.findFirst({
        where: {
          website: { contains: domain, mode: 'insensitive' },
          status: { notIn: ['STALE', 'CANCELLED'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (byWebsite) return byWebsite;
    }
  }

  // 3. Fuzzy project name match — only if high confidence
  if (projectName && extraction.projectName.confidence >= 0.8) {
    const candidates = await prisma.launchRecord.findMany({
      where: {
        projectName: { not: undefined },
        status: { notIn: ['STALE', 'CANCELLED'] },
      },
      select: { id: true, projectName: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    for (const candidate of candidates) {
      if (!candidate.projectName) continue;
      const distance = levenshtein(
        projectName.toLowerCase(),
        candidate.projectName.toLowerCase()
      );
      const threshold = projectName.length > 8 ? 3 : 2;
      if (distance <= threshold) {
        return prisma.launchRecord.findUnique({ where: { id: candidate.id } });
      }
    }
  }

  return null;
}

function extractDomain(url: string): string | null {
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const { hostname } = new URL(normalized);
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
