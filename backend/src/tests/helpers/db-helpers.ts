import type { LaunchRecord, LaunchStatus, TweetSignal, MonitoredAccount, LaunchSource } from '@prisma/client';
import { prisma } from '../../db/client.js';

/**
 * Poll DB until a LaunchRecord for the given handle reaches the expected status.
 */
export async function waitForStatus(
  handle: string,
  status: LaunchStatus,
  timeoutMs = 10000
): Promise<LaunchRecord> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const record = await prisma.launchRecord.findFirst({
      where: { twitterHandle: { equals: handle, mode: 'insensitive' } },
    });
    if (record && record.status === status) return record;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for @${handle} to reach status ${status} (${timeoutMs}ms)`);
}

/**
 * Poll DB until a LaunchRecord exists for the given handle.
 */
export async function waitForLaunchRecord(
  handle: string,
  timeoutMs = 10000
): Promise<LaunchRecord> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const record = await prisma.launchRecord.findFirst({
      where: { twitterHandle: { equals: handle, mode: 'insensitive' } },
    });
    if (record) return record;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for LaunchRecord for @${handle} (${timeoutMs}ms)`);
}

/**
 * Poll DB until the LaunchRecord's confidenceScore reaches at least the given threshold.
 */
export async function waitForConfidence(
  handle: string,
  minScore: number,
  timeoutMs = 10000
): Promise<LaunchRecord> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const record = await prisma.launchRecord.findFirst({
      where: { twitterHandle: { equals: handle, mode: 'insensitive' } },
    });
    if (record && record.confidenceScore >= minScore) return record;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for @${handle} confidence >= ${minScore} (${timeoutMs}ms)`);
}

/** Fetch the latest LaunchRecord for a given twitter handle. */
export async function findLaunchByHandle(handle: string): Promise<LaunchRecord | null> {
  return prisma.launchRecord.findFirst({
    where: { twitterHandle: { equals: handle, mode: 'insensitive' } },
  });
}

/** Fetch all TweetSignals linked to a LaunchRecord. */
export async function getTweetSignals(launchId: string): Promise<TweetSignal[]> {
  return prisma.tweetSignal.findMany({
    where: { launchRecordId: launchId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Fetch all LaunchSources linked to a LaunchRecord. */
export async function getLaunchSources(launchId: string): Promise<LaunchSource[]> {
  return prisma.launchSource.findMany({
    where: { launchRecordId: launchId },
    orderBy: { createdAt: 'asc' },
  });
}

/** Fetch MonitoredAccount for a handle. */
export async function getMonitoredAccount(handle: string): Promise<MonitoredAccount | null> {
  return prisma.monitoredAccount.findUnique({
    where: { twitterHandle: handle },
  });
}

/** Count TweetSignals by tweetId. */
export async function countTweetSignalsByTweetId(tweetId: string): Promise<number> {
  return prisma.tweetSignal.count({ where: { tweetId } });
}

/** Wipe all test data between tests. Uses TRUNCATE CASCADE to avoid FK issues. */
export async function resetTestData(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "LaunchSource", "TweetSignal", "MonitoredAccount", "LaunchRecord" CASCADE`
  );
}

/**
 * Wait until all BullMQ jobs are processed (no waiting or active jobs).
 */
export async function waitForQueueDrain(
  queues: Array<{ getJobCounts: () => Promise<Record<string, number>> }>,
  timeoutMs = 15000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let allDrained = true;
    for (const queue of queues) {
      const counts = await queue.getJobCounts();
      if ((counts.waiting ?? 0) > 0 || (counts.active ?? 0) > 0 || (counts.delayed ?? 0) > 0) {
        allDrained = false;
        break;
      }
    }
    if (allDrained) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for queues to drain (${timeoutMs}ms)`);
}
