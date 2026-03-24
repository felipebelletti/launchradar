import { isLaunchAnnouncement, isCryptoRelated, isShillTweet, classifyLaunchTiming } from '../src/ai/classifier.js';
import { extractLaunchData } from '../src/ai/extractor.js';
import { ocrTweetImages } from '../src/ocr/image-ocr.js';
import type * as twitterApi from '../src/services/twitterapi.service.js';

export type TweetResult = twitterApi.AdvancedSearchResult['tweets'][number];

export type Verdict = 'NOT_LAUNCH' | 'SHILL' | 'NOT_CRYPTO' | 'EXTRACTED';

export async function processTweet(tweet: TweetResult, idx: number, total: number): Promise<Verdict> {
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

  const isLaunch = await isLaunchAnnouncement(tweet.text, ocrText);
  console.log(`  Stage 1 — Launch announcement: ${isLaunch ? '✅ YES' : '❌ NO'}`);

  if (!isLaunch) {
    console.log('  ⏭️  Skipping remaining stages (not a launch)');
    return 'NOT_LAUNCH';
  }

  const isShill = await isShillTweet(tweet.text, ocrText, tweet.author.userName, tweet.author.description ?? '', tweet.author.followers ?? 0);
  console.log(`  Shill check: ${isShill ? '🚫 SHILL' : '✅ GENUINE'}`);

  if (isShill) {
    console.log('  ⏭️  Skipping remaining stages (shill)');
    return 'SHILL';
  }

  const isCrypto = await isCryptoRelated(tweet.text, authorBio, ocrText);
  console.log(`  Stage 2 — Crypto related: ${isCrypto ? '✅ YES' : '❌ NO'}`);

  if (!isCrypto) {
    console.log('  ⏭️  Skipping extraction (not crypto)');
    return 'NOT_CRYPTO';
  }

  const timing = await classifyLaunchTiming(tweet.text, ocrText);
  console.log(`  Timing: ${timing.toUpperCase()}`);

  console.log('  ⏳ Running extractor...');
  const tweetCreatedAt = tweet.createdAt ? new Date(tweet.createdAt) : undefined;
  const result = await extractLaunchData(tweet.text, authorBio, ocrText, undefined, tweetCreatedAt);

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
