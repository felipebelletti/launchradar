export interface TweetData {
  id: string;
  text: string;
  authorHandle: string;
  authorId: string;
  authorBio: string;
  authorFollowers: number;
  authorIsVerified: boolean;
  authorWebsite?: string;
  imageUrls: string[];
  likes: number;
  retweets: number;
  createdAt: Date;
}

export interface AuthorProfile {
  id: string;
  userName: string;
  name: string;
  description: string;
  website?: string;
  followers: number;
  isVerified: boolean;
  isBlueVerified: boolean;
}

export interface ExtractionFieldResult {
  value: string | null;
  confidence: number;
}

export interface ExtractionResult {
  projectName: ExtractionFieldResult;
  ticker: ExtractionFieldResult;
  launchDate: ExtractionFieldResult;
  launchDateRaw: ExtractionFieldResult;
  launchType: ExtractionFieldResult;
  chain: ExtractionFieldResult;
  category: ExtractionFieldResult;
  website: ExtractionFieldResult;
  summary: ExtractionFieldResult;
}

export interface EnrichmentJobData {
  launchRecordId: string;
  twitterHandle: string;
}

export interface AccountMonitorJobData {
  twitterHandle: string;
  launchRecordId: string;
}

export type RuleTier = 'TIER_A' | 'TIER_B' | 'TIER_C';

export interface TwitterApiRule {
  id: string;
  label: string;
  filter: string;
  intervalSeconds: number;
}

export interface TwitterApiRuleListResponse {
  rules: TwitterApiRule[];
  totalCount?: number;
  maxRules?: number;
}

export interface UserInfoResponse {
  id: string;
  userName: string;
  name: string;
  description?: string;
  website?: string;
  publicMetrics?: {
    followersCount: number;
    followingCount: number;
    tweetCount: number;
  };
  isVerified?: boolean;
  isBlueVerified?: boolean;
}
