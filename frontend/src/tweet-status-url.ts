import type { TweetSignal } from './types';

export function tweetStatusUrl(authorHandle: string, tweetId: string): string {
  const h = authorHandle.replace(/^@/, '').trim();
  return `https://x.com/${h}/status/${tweetId}`;
}

export function resolveSignalTweetUrl(
  sourceTweetUrl: string | null | undefined,
  tweets: TweetSignal[] | undefined,
): string | null {
  if (sourceTweetUrl) return sourceTweetUrl;
  if (!tweets?.length) return null;
  const primary = [...tweets].sort(
    (a, b) => new Date(a.ingestedAt).getTime() - new Date(b.ingestedAt).getTime(),
  )[0];
  return tweetStatusUrl(primary.authorHandle, primary.tweetId);
}
