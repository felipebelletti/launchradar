import WebSocket from 'ws';
import { redis } from '../redis.js';
import { config } from '../config.js';
import { ingestTweet } from './ingest.service.js';
import { createChildLogger } from '../logger.js';
import type { TweetData } from '../types/index.js';

const log = createChildLogger('twitter-stream');

const WS_URL = 'wss://ws.twitterapi.io/twitter/tweet/websocket';
const REDIS_KEY_DAILY_CREDITS = 'credits:daily';
const TWEET_CREDIT_COST = 15;
const INITIAL_RECONNECT_MS = 5_000;
const MAX_RECONNECT_MS = 90_000;

interface WsTweet {
  id: string;
  text: string;
  author: {
    id: string;
    userName: string;
    name: string;
    description?: string;
    followers?: number;
    following?: number;
    isVerified?: boolean;
    isBlueVerified?: boolean;
    website?: string;
  };
  createdAt: string;
  retweetCount: number;
  likeCount: number;
  replyCount: number;
  photos?: Array<{ url: string }>;
}

interface WsTweetEvent {
  event_type: 'tweet';
  rule_id: string;
  rule_tag: string;
  tweets: WsTweet[];
  timestamp: number;
}

interface WsPingEvent {
  event_type: 'ping';
  timestamp: number;
}

interface WsConnectedEvent {
  event_type: 'connected';
}

type WsMessage = WsTweetEvent | WsPingEvent | WsConnectedEvent;

function getTodayKey(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${REDIS_KEY_DAILY_CREDITS}:${today}`;
}

async function trackCredits(creditCost: number): Promise<boolean> {
  const key = getTodayKey();
  const newTotal = await redis.incrby(key, creditCost);
  await redis.expire(key, 48 * 60 * 60);

  if (newTotal > config.DAILY_CREDIT_BUDGET) {
    log.error('Daily credit budget exceeded, pausing ingestion', {
      newTotal,
      budget: config.DAILY_CREDIT_BUDGET,
    });
    return false;
  }
  return true;
}

function normalizeTweet(tweet: WsTweet): TweetData {
  const imageUrls = (tweet.photos ?? []).map(p => p.url);
  return {
    id: tweet.id,
    text: tweet.text,
    authorHandle: tweet.author.userName,
    authorId: tweet.author.id,
    authorBio: tweet.author.description ?? '',
    authorFollowers: tweet.author.followers ?? 0,
    authorIsVerified: tweet.author.isVerified === true || tweet.author.isBlueVerified === true,
    authorWebsite: tweet.author.website,
    imageUrls,
    likes: tweet.likeCount,
    retweets: tweet.retweetCount,
    createdAt: new Date(tweet.createdAt),
  };
}

export class TwitterStreamClient {
  private ws: WebSocket | null = null;
  private reconnectMs = INITIAL_RECONNECT_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  connect(): void {
    this.intentionalClose = false;
    log.info('Connecting to Twitter WebSocket stream', { url: WS_URL });

    this.ws = new WebSocket(WS_URL, {
      headers: { 'x-api-key': config.TWITTERAPI_KEY },
    });

    this.ws.on('open', () => {
      log.info('WebSocket connection opened');
      this.reconnectMs = INITIAL_RECONNECT_MS;
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      this.handleMessage(raw);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      log.warn('WebSocket closed', { code, reason: reason.toString() });
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err: Error) => {
      log.error('WebSocket error', { err });
    });
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'shutdown');
      this.ws = null;
    }
    log.info('WebSocket stream client closed');
  }

  private scheduleReconnect(): void {
    log.info('Scheduling reconnect', { delayMs: this.reconnectMs });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectMs);
    this.reconnectMs = Math.min(this.reconnectMs * 2, MAX_RECONNECT_MS);
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let msg: WsMessage;
    try {
      msg = JSON.parse(raw.toString()) as WsMessage;
    } catch {
      log.warn('Received non-JSON WebSocket message', { raw: raw.toString().slice(0, 200) });
      return;
    }

    switch (msg.event_type) {
      case 'connected':
        log.info('Twitter stream authenticated');
        break;

      case 'ping':
        log.debug('Ping received', { timestamp: msg.timestamp });
        break;

      case 'tweet':
        this.handleTweetEvent(msg);
        break;

      default:
        log.debug('Unknown WebSocket event', { event_type: (msg as Record<string, unknown>).event_type });
    }
  }

  private handleTweetEvent(event: WsTweetEvent): void {
    const { rule_tag, tweets } = event;

    // Tier C rules have been migrated to polling — ignore stale WebSocket deliveries
    if (rule_tag.startsWith('account_')) {
      log.warn('Ignoring stale Tier C WebSocket delivery', { ruleTag: rule_tag });
      return;
    }

    log.info('Tweet event received', {
      ruleTag: rule_tag,
      tweetCount: tweets.length,
      tweetTexts: tweets.map(t => t.text),
    });

    for (const tweet of tweets) {
      const tweetData = normalizeTweet(tweet);

      trackCredits(TWEET_CREDIT_COST)
        .then(withinBudget => {
          if (!withinBudget) {
            log.warn('Skipping tweet due to budget', { tweetId: tweetData.id });
            return;
          }
          return ingestTweet(tweetData, rule_tag);
        })
        .catch(err => {
          log.error('Ingest error for tweet', { tweetId: tweetData.id, err });
        });
    }
  }
}
