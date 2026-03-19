import fetch from 'node-fetch';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';
import type {
  TwitterApiRule,
  TwitterApiRuleListResponse,
  UserInfoResponse,
} from '../types/index.js';

const log = createChildLogger('twitterapi');
const BASE_URL = 'https://api.twitterapi.io';
const TWEET_FILTER_BASE = `${BASE_URL}/oapi/tweet_filter`;
const ADD_RULE_INTERVAL_MIN = 100;

function headers(): Record<string, string> {
  return {
    'x-api-key': config.TWITTERAPI_KEY,
    'Content-Type': 'application/json',
  };
}

async function handleResponse<T>(res: Awaited<ReturnType<typeof fetch>>): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`twitterapi.io HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface AdvancedSearchResult {
  tweets: Array<{
    id: string;
    text: string;
    author: {
      id: string;
      userName: string;
      name: string;
      description?: string;
      website?: string;
      publicMetrics?: { followersCount: number };
      isVerified?: boolean;
      isBlueVerified?: boolean;
    };
    createdAt: string;
    likeCount: number;
    retweetCount: number;
    photos?: Array<{ url: string }>;
  }>;
  nextCursor?: string;
}

interface AddRuleApiResponse {
  rule_id: string;
  status: string;
  msg?: string;
}

interface GetRulesApiResponse {
  rules: Array<{
    rule_id: string;
    tag: string;
    value: string;
    interval_seconds?: number;
  }>;
  status: string;
  msg?: string;
}

export async function listRules(): Promise<TwitterApiRuleListResponse> {
  const res = await fetch(`${TWEET_FILTER_BASE}/get_rules`, {
    method: 'GET',
    headers: headers(),
  });
  const data = await handleResponse<GetRulesApiResponse>(res);
  const rules: TwitterApiRule[] = (data.rules ?? []).map(r => ({
    id: r.rule_id,
    label: r.tag,
    filter: r.value,
    intervalSeconds: r.interval_seconds ?? 100,
  }));
  return { rules };
}

export async function createRule(
  label: string,
  filter: string,
  intervalSeconds: number
): Promise<TwitterApiRule> {
  const interval = Math.max(ADD_RULE_INTERVAL_MIN, Math.min(86400, intervalSeconds));
  const res = await fetch(`${TWEET_FILTER_BASE}/add_rule`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      tag: label,
      value: filter,
      interval_seconds: interval,
    }),
  });
  const data = await handleResponse<AddRuleApiResponse>(res);
  if (data.status === 'error') {
    throw new Error(`twitterapi.io add_rule failed: ${data.msg ?? 'Unknown error'}`);
  }
  await updateRule(data.rule_id, label, filter, interval, true);
  return {
    id: data.rule_id,
    label,
    filter,
    intervalSeconds: interval,
  };
}

async function updateRule(
  ruleId: string,
  tag: string,
  value: string,
  intervalSeconds: number,
  isEffect: boolean
): Promise<void> {
  const res = await fetch(`${TWEET_FILTER_BASE}/update_rule`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      rule_id: ruleId,
      tag,
      value,
      interval_seconds: intervalSeconds,
      is_effect: isEffect ? 1 : 0,
    }),
  });
  const data = (await handleResponse<{ status?: string; msg?: string }>(res)) as {
    status?: string;
    msg?: string;
  };
  if (data.status === 'error') {
    throw new Error(`twitterapi.io update_rule failed: ${data.msg ?? 'Unknown error'}`);
  }
}

export async function deleteRule(ruleId: string): Promise<void> {
  const res = await fetch(`${TWEET_FILTER_BASE}/delete_rule`, {
    method: 'DELETE',
    headers: headers(),
    body: JSON.stringify({ rule_id: ruleId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to delete rule ${ruleId}: HTTP ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { status?: string; msg?: string };
  if (data.status === 'error') {
    throw new Error(`twitterapi.io delete_rule failed: ${data.msg ?? 'Unknown error'}`);
  }
}

/**
 * Infer max rules from the API response or return a safe conservative default.
 * The API may return a maxRules field; if not, default to 50 as a safe threshold.
 */
export async function getMaxRules(): Promise<number> {
  try {
    const data = await listRules();
    if (typeof data.maxRules === 'number' && data.maxRules > 0) {
      return data.maxRules;
    }
  } catch (err) {
    log.warn('Could not fetch max rules from API, using default', { err });
  }
  return 50; // Conservative safe default
}

/**
 * Get user profile info by Twitter username.
 */
interface UserInfoApiData {
  id: string;
  userName: string;
  name: string;
  description?: string;
  url?: string;
  followers?: number;
  following?: number;
  isBlueVerified?: boolean;
  profile_bio?: { description?: { urls?: Array<{ expanded_url?: string }> } };
}

export async function getUserInfo(userName: string): Promise<UserInfoResponse | null> {
  try {
    const url = new URL(`${BASE_URL}/twitter/user/info`);
    url.searchParams.set('userName', userName);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: headers(),
    });

    if (!res.ok) {
      log.warn('getUserInfo failed', { userName, status: res.status });
      return null;
    }

    const raw = (await res.json()) as { data?: UserInfoApiData };
    const u = raw.data;
    if (!u) return null;

    let website: string | undefined = u.url;
    if (!website && u.profile_bio?.description?.urls?.length) {
      website = u.profile_bio.description.urls[0]?.expanded_url;
    }

    return {
      id: u.id,
      userName: u.userName,
      name: u.name,
      description: u.description,
      website,
      publicMetrics: {
        followersCount: u.followers ?? 0,
        followingCount: u.following ?? 0,
        tweetCount: 0,
      },
      isVerified: false,
      isBlueVerified: u.isBlueVerified ?? false,
    };
  } catch (err) {
    log.error('getUserInfo error', { userName, err });
    return null;
  }
}

/**
 * Advanced search for tweets.
 * Use for enrichment: fetch follow-up tweets from a known author.
 */
export async function advancedSearch(
  query: string,
  queryType: 'Latest' | 'Top' = 'Latest',
  cursor?: string
): Promise<AdvancedSearchResult> {
  const url = new URL(`${BASE_URL}/twitter/tweet/advanced_search`);
  url.searchParams.set('query', query);
  url.searchParams.set('queryType', queryType);
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: headers(),
  });

  return handleResponse<AdvancedSearchResult>(res);
}
