export type LaunchStatus = 'STUB' | 'PARTIAL' | 'CONFIRMED' | 'VERIFIED' | 'LIVE' | 'STALE' | 'CANCELLED';
export type SourceType = 'TWEET' | 'PROFILE' | 'WEBSITE' | 'MANUAL' | 'IMAGE_OCR';
export type RuleSource = 'TIER_A' | 'TIER_B' | 'TIER_C';
export type IngestTiming = 'FUTURE' | 'LIVE' | 'UNKNOWN';
export type TweetTimeBadge =
  | 'LIVE_NOW'
  | 'NEXT_HOUR'
  | 'TODAY'
  | 'THIS_WEEK'
  | 'LATER'
  | 'IN_N_DAYS'
  | 'UPCOMING'
  | 'TIME_UNKNOWN'
  | 'RESCHEDULED'
  | 'NO_DATE';
export type Plan = 'free' | 'scout' | 'alpha' | 'pro';
export type AppMode = 'terminal' | 'simple';
export type Timeframe = 'hour' | 'today' | 'week' | 'tbd' | 'all';

export interface LaunchRecord {
  id: string;
  projectName: string;
  ticker: string | null;
  launchDate: string | null;
  launchDateRaw: string | null;
  launchDateConfidence: number | null;
  previousLaunchDate: string | null;
  rescheduledAt: string | null;
  launchType: string | null;
  chain: string | null;
  categories: string[];
  primaryCategory: string | null;
  website: string | null;
  whitepaper: string | null;
  summary: string | null;
  twitterHandle: string | null;
  twitterFollowers: number | null;
  isVerifiedAccount: boolean;
  confidenceScore: number;
  status: LaunchStatus;
  ruleSource: RuleSource;
  sources: LaunchSource[];
  tweets: TweetSignal[];
  createdAt: string;
  updatedAt: string;
  launchedAt: string | null;
  sourceTweetUrl?: string | null;
  redacted?: boolean;
}

export interface TweetSignal {
  id: string;
  tweetId: string;
  text: string;
  imageUrls: string[];
  imageOcrText: string | null;
  authorHandle: string;
  authorId: string;
  likes: number;
  retweets: number;
  createdAt: string;
  ingestedAt: string;
  launchRecordId: string | null;
  ingestTiming?: IngestTiming | null;
  timeBadge?: TweetTimeBadge | null;
  timeBadgeDetail?: number | null;
}

export interface LaunchSource {
  id: string;
  type: SourceType;
  url: string;
  rawContent: string | null;
  extractedData: Record<string, unknown> | null;
  launchRecordId: string;
  createdAt: string;
}

export interface CalendarData {
  hour: LaunchRecord[];
  today: LaunchRecord[];
  week: LaunchRecord[];
  live: LaunchRecord[];
  tbd: LaunchRecord[];
}

export type BackendEvent =
  | { type: 'launch:new'; payload: LaunchRecord }
  | { type: 'launch:updated'; payload: LaunchRecord }
  | { type: 'launch:cancelled'; payload: { id: string } };
