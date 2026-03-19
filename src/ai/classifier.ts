import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
const log = createChildLogger('ai:classifier');

const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Stage 1: Binary launch announcement filter.
 * Runs on Tier B tweets only (Tier A tweets skip this — already chain-confirmed).
 */
export async function isLaunchAnnouncement(
  tweetText: string,
  ocrText: string
): Promise<boolean> {
  const userContent = [
    `Does this tweet announce, tease, or reference an upcoming launch, release, or go-live event of any product, project, or service? Reply with only "YES" or "NO".`,
    ``,
    `Tweet: "${tweetText}"`,
    ocrText ? `Image text: "${ocrText}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const start = Date.now();
  log.info('Anthropic API call', {
    call: 'stage1_launch_filter',
    model: CLASSIFIER_MODEL,
    tweetPreview: tweetText.slice(0, 80),
  });

  try {
    const response = await client.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 5,
      system: 'You are a classifier. Reply with only "YES" or "NO".',
      messages: [{ role: 'user', content: userContent }],
    });

    const text =
      response.content[0].type === 'text'
        ? response.content[0].text.trim().toUpperCase()
        : 'NO';
    const result = text === 'YES';

    log.info('Anthropic API response', {
      call: 'stage1_launch_filter',
      model: CLASSIFIER_MODEL,
      result,
      tweetText: tweetText,
      durationMs: Date.now() - start,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });

    return result;
  } catch (err) {
    log.error('Stage 1 classifier error', { err, durationMs: Date.now() - start });
    return false;
  }
}

/**
 * Stage 2: Crypto relevance filter.
 * Runs on Tier B tweets that passed Stage 1. Tier A and Tier C tweets skip this.
 */
export async function isCryptoRelated(
  tweetText: string,
  authorBio: string,
  ocrText: string
): Promise<boolean> {
  const userContent = [
    `Is this tweet related to a cryptocurrency, token, NFT, DeFi protocol, blockchain network, or Web3 project? Reply with only "YES" or "NO".`,
    ``,
    `Tweet: "${tweetText}"`,
    `Author bio: "${authorBio}"`,
    ocrText ? `Image text: "${ocrText}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const start = Date.now();
  log.info('Anthropic API call', {
    call: 'stage2_crypto_filter',
    model: CLASSIFIER_MODEL,
    tweetPreview: tweetText.slice(0, 80),
  });

  try {
    const response = await client.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 5,
      system: 'You are a classifier. Reply with only "YES" or "NO".',
      messages: [{ role: 'user', content: userContent }],
    });

    const text =
      response.content[0].type === 'text'
        ? response.content[0].text.trim().toUpperCase()
        : 'NO';
    const result = text === 'YES';

    log.info('Anthropic API response', {
      call: 'stage2_crypto_filter',
      model: CLASSIFIER_MODEL,
      result,
      tweetText: tweetText,
      durationMs: Date.now() - start,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });

    return result;
  } catch (err) {
    log.error('Stage 2 classifier error', { err, durationMs: Date.now() - start });
    return false;
  }
}
