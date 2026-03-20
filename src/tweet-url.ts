import { prisma } from './db/client.js';

export function tweetStatusUrl(authorHandle: string, tweetId: string): string {
  const h = authorHandle.replace(/^@/, '').trim();
  return `https://x.com/${h}/status/${tweetId}`;
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
