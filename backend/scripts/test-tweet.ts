import * as twitterApi from '../src/services/twitterapi.service.js';
import { processTweet } from './classifier-pipeline.js';

const tweetId = process.argv[2]?.trim();
if (!tweetId) {
  console.error('Usage: test-tweet.ts <tweet_id>');
  process.exit(1);
}

async function main() {
  console.log(`\n🔎 Fetching tweet ${tweetId}...\n`);

  const tweets = await twitterApi.getTweetsByIds([tweetId]);
  const tweet = tweets[0];
  if (!tweet) {
    console.error('Tweet not found.');
    process.exit(1);
  }

  console.log('Running classifier → extractor pipeline...\n');
  const verdict = await processTweet(tweet, 0, 1);

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`VERDICT — ${tweetId} — ${verdict}`);
  console.log(`${'═'.repeat(80)}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
