/**
 * Test script: fetch a Twitter profile's recent tweets and run each
 * through the classifier → extractor pipeline, showing results.
 *
 * Usage:
 *   node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/test-profile.ts <handle>
 */
import { isLaunchAnnouncement, isCryptoRelated, isShillTweet, classifyLaunchTiming } from '../src/ai/classifier.js';
import { extractLaunchData } from '../src/ai/extractor.js';
import { ocrTweetImages } from '../src/ocr/image-ocr.js';
import { config } from '../src/config.js';

const handle = process.argv[2]?.replace(/^@/, '');
if (!handle) {
  console.error('Usage: test-profile.ts <twitter_handle>');
  process.exit(1);
}

const API_BASE = 'https://api.twitterapi.io';

interface TweetResult {
  id: string;
  text: string;
  author: {
    userName: string;
    name: string;
    description?: string;
  };
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  photos?: Array<{ url: string }>;
}

interface SearchResponse {
  tweets: TweetResult[];
  nextCursor?: string;
}

async function fetchTweets(username: string): Promise<TweetResult[]> {
  const query = `from:${username} -is:retweet -is:reply`;
  const url = new URL(`${API_BASE}/twitter/tweet/advanced_search`);
  url.searchParams.set('query', query);
  url.searchParams.set('queryType', 'Latest');

  const res = await fetch(url.toString(), {
    headers: {
      'x-api-key': config.TWITTERAPI_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter API ${res.status}: ${body}`);
  }

  const data = (await res.json()) as SearchResponse;
  return data.tweets ?? [];
}

type Verdict = 'NOT_LAUNCH' | 'SHILL' | 'NOT_CRYPTO' | 'EXTRACTED';

async function processTweet(tweet: TweetResult, idx: number, total: number): Promise<Verdict> {
  const authorBio = tweet.author.description ?? '';
  const imageUrls = tweet.photos?.map((p) => p.url) ?? [];

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`TWEET ${idx + 1}/${total}  [${tweet.id}]  ${tweet.createdAt}`);
  console.log(`${'─'.repeat(80)}`);
  console.log(tweet.text);
  if (imageUrls.length > 0) {
    console.log(`  📷 ${imageUrls.length} image(s)`);
  }
  console.log(`  ❤️  ${tweet.likeCount}  🔁 ${tweet.retweetCount}`);
  console.log(`${'─'.repeat(80)}`);

  // OCR
  let ocrText = '';
  if (imageUrls.length > 0) {
    console.log('  ⏳ Running OCR...');
    ocrText = await ocrTweetImages(imageUrls);
    if (ocrText) {
      console.log(`  🔍 OCR: "${ocrText.slice(0, 120)}${ocrText.length > 120 ? '...' : ''}"`);
    } else {
      console.log('  🔍 OCR: (no text found)');
    }
  }

  // Stage 1: Launch announcement?
  const isLaunch = await isLaunchAnnouncement(tweet.text, ocrText);
  console.log(`  Stage 1 — Launch announcement: ${isLaunch ? '✅ YES' : '❌ NO'}`);

  if (!isLaunch) {
    console.log('  ⏭️  Skipping remaining stages (not a launch)');
    return 'NOT_LAUNCH';
  }

  // Shill check
  const isShill = await isShillTweet(tweet.text, ocrText, tweet.author.userName, tweet.author.description ?? '', tweet.author.followers ?? 0);
  console.log(`  Shill check: ${isShill ? '🚫 SHILL' : '✅ GENUINE'}`);

  if (isShill) {
    console.log('  ⏭️  Skipping remaining stages (shill)');
    return 'SHILL';
  }

  // Stage 2: Crypto related?
  const isCrypto = await isCryptoRelated(tweet.text, authorBio, ocrText);
  console.log(`  Stage 2 — Crypto related: ${isCrypto ? '✅ YES' : '❌ NO'}`);

  if (!isCrypto) {
    console.log('  ⏭️  Skipping extraction (not crypto)');
    return 'NOT_CRYPTO';
  }

  // Launch timing
  const timing = await classifyLaunchTiming(tweet.text, ocrText);
  console.log(`  Timing: ${timing.toUpperCase()}`);

  // Stage 3: Extraction
  console.log('  ⏳ Running extractor...');
  const result = await extractLaunchData(tweet.text, authorBio, ocrText);

  console.log('  📊 EXTRACTION RESULT:');
  const fields = [
    ['Project',    result.projectName],
    ['Ticker',     result.ticker],
    ['Chain',      result.chain],
    ['Launch',     result.launchDateRaw],
    ['Date',       result.launchDate],
    ['Type',       result.launchType],
    ['Categories', result.categories],
    ['Primary',    result.primaryCategory],
    ['Website',    result.website],
    ['Summary',    result.summary],
  ] as const;

  for (const [label, field] of fields) {
    const val = Array.isArray(field.value)
      ? field.value.join(', ') || '—'
      : field.value ?? '—';
    const conf = (field.confidence * 100).toFixed(0);
    console.log(`     ${label.padEnd(12)} ${String(val).padEnd(40)} (${conf}%)`);
  }

  return 'EXTRACTED';
}

async function main() {
  console.log(`\n🔎 Fetching tweets for @${handle}...\n`);

  const tweets = await fetchTweets(handle);
  if (tweets.length === 0) {
    console.log('No tweets found.');
    process.exit(0);
  }

  console.log(`Found ${tweets.length} tweets. Processing through classifier → extractor pipeline...\n`);

  const verdicts: Record<Verdict, number> = { NOT_LAUNCH: 0, SHILL: 0, NOT_CRYPTO: 0, EXTRACTED: 0 };
  for (let i = 0; i < tweets.length; i++) {
    const v = await processTweet(tweets[i]!, i, tweets.length);
    verdicts[v]++;
  }

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`SUMMARY — @${handle} — ${tweets.length} tweets`);
  console.log(`  Extracted:  ${verdicts.EXTRACTED}`);
  console.log(`  Not launch: ${verdicts.NOT_LAUNCH}`);
  console.log(`  Shill:      ${verdicts.SHILL}`);
  console.log(`  Not crypto: ${verdicts.NOT_CRYPTO}`);
  console.log(`${'═'.repeat(80)}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
