import crypto from 'node:crypto';
import type { TweetData } from '../../types/index.js';

interface TweetAuthorOverrides {
  id?: string;
  userName?: string;
  name?: string;
  description?: string;
  followers?: number;
  isVerified?: boolean;
  isBlueVerified?: boolean;
  website?: string;
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

export interface TestTweetPayload {
  tweetData: TweetData;
  ruleLabel: string;
}

export function makeTweetPayload(
  ruleLabel: string,
  overrides?: {
    tweetId?: string;
    text?: string;
    author?: TweetAuthorOverrides;
    photos?: Array<{ url: string }>;
    createdAt?: string;
  }
): TestTweetPayload {
  const authorId = overrides?.author?.id ?? randomId();
  const userName = overrides?.author?.userName ?? `user_${randomId().slice(0, 8)}`;
  const imageUrls = (overrides?.photos ?? []).map(p => p.url);

  return {
    tweetData: {
      id: overrides?.tweetId ?? randomId(),
      text: overrides?.text ?? 'default tweet text',
      authorHandle: userName,
      authorId,
      authorBio: overrides?.author?.description ?? '',
      authorFollowers: overrides?.author?.followers ?? 100,
      authorIsVerified: overrides?.author?.isVerified === true || overrides?.author?.isBlueVerified === true,
      authorWebsite: overrides?.author?.website,
      imageUrls,
      likes: 0,
      retweets: 0,
      createdAt: new Date(overrides?.createdAt ?? new Date().toISOString()),
    },
    ruleLabel,
  };
}

export function makeTierAPayload(
  chain: 'chain_sol' | 'chain_eth' | 'chain_bsc' | 'chain_pump',
  overrides?: Parameters<typeof makeTweetPayload>[1]
): TestTweetPayload {
  return makeTweetPayload(chain, overrides);
}

export function makeTierBPayload(
  overrides?: Parameters<typeof makeTweetPayload>[1]
): TestTweetPayload {
  return makeTweetPayload('time_signals', overrides);
}

export function makeTierCPayload(
  handle: string,
  overrides?: Parameters<typeof makeTweetPayload>[1]
): TestTweetPayload {
  return makeTweetPayload(`account_${handle}`, {
    ...overrides,
    author: { userName: handle, ...overrides?.author },
  });
}
