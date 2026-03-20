import { prisma } from './db/client.js';

export function tweetStatusUrl(authorHandle: string, tweetId: string): string {
  const h = authorHandle.replace(/^@/, '').trim();
  return `https://x.com/${h}/status/${tweetId}`;
}

export function tweetUrlForLog(tweetId: string, authorHandle?: string): string {
  if (authorHandle?.replace(/^@/, '').trim()) {
    return tweetStatusUrl(authorHandle, tweetId);
  }
  return `https://x.com/i/status/${tweetId}`;
}

export function tweetLogFields(
  tweetId: string,
  authorHandle?: string,
): { tweetId: string; tweetUrl: string } {
  return { tweetId, tweetUrl: tweetUrlForLog(tweetId, authorHandle) };
}

export async function getPrimarySignalTweetUrlForLaunch(
  launchRecordId: string,
): Promise<string | null> {
  const sig = await prisma.tweetSignal.findFirst({
    where: { launchRecordId },
    orderBy: { ingestedAt: 'asc' },
    select: { tweetId: true, authorHandle: true },
  });
  if (!sig) return null;
  return tweetStatusUrl(sig.authorHandle, sig.tweetId);
}
