import { xaiClient, GROK_MODEL } from './client.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('ai:classifier');

export async function isLaunchAnnouncement(
  tweetText: string,
  ocrText: string
): Promise<boolean> {
  const userContent = [
    `Does this tweet primarily announce, tease, or build anticipation for a FUTURE go-live: token listing, presale, mint, TGE, mainnet, airdrop, or similar? Reply only "YES" or "NO".`,
    `Say NO for: price or performance news (surges, gains, % up, "within 24h after"), market recaps, "JUST IN" trading headlines, or anything describing a launch or listing that ALREADY happened.`,
    ``,
    `Tweet: "${tweetText}"`,
    ocrText ? `Image text: "${ocrText}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const start = Date.now();

  try {
    const response = await xaiClient.responses.create({
      model: GROK_MODEL,
      max_output_tokens: 5,
      input: [
        { role: 'system', content: 'You are a classifier. Reply with only "YES" or "NO".' },
        { role: 'user', content: userContent },
      ],
      store: false,
    });

    const text = (response.output_text ?? 'NO').trim().toUpperCase();
    const result = text === 'YES';

    const usage = response.usage as { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    log.debug('Stage 1 result', {
      result,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
    });

    return result;
  } catch (err) {
    log.error('Stage 1 classifier error', { err, durationMs: Date.now() - start });
    return false;
  }
}

export type LaunchTiming = 'future' | 'live' | 'unknown';

export async function classifyLaunchTiming(
  tweetText: string,
  ocrText: string
): Promise<LaunchTiming> {
  const userContent = [
    `Classify this tweet:`,
    `- "future" the project/token/protocol is announcing it will launch soon or on a specific date`,
    `- "live" the project/token/protocol has just launched or is live right now`,
    `- "unknown" cannot determine`,
    ``,
    `Tweet: "${tweetText}"`,
    ocrText ? `[Image text]: "${ocrText}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const start = Date.now();

  try {
    const response = await xaiClient.responses.create({
      model: GROK_MODEL,
      max_output_tokens: 5,
      input: [
        { role: 'system', content: 'You are a classifier. Reply with only one word: "future", "live", or "unknown".' },
        { role: 'user', content: userContent },
      ],
      store: false,
    });

    const text = (response.output_text ?? '').trim().toLowerCase();

    const usage = response.usage as { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    log.debug('Launch timing result', {
      result: text,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
    });

    if (text === 'live') return 'live';
    if (text === 'future') return 'future';
    return 'unknown';
  } catch (err) {
    log.error('Launch timing classifier error', { err, durationMs: Date.now() - start });
    return 'unknown';
  }
}

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

  try {
    const response = await xaiClient.responses.create({
      model: GROK_MODEL,
      max_output_tokens: 5,
      input: [
        { role: 'system', content: 'You are a classifier. Reply with only "YES" or "NO".' },
        { role: 'user', content: userContent },
      ],
      store: false,
    });

    const text = (response.output_text ?? 'NO').trim().toUpperCase();
    const result = text === 'YES';

    const usage = response.usage as { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    log.debug('Stage 2 result', {
      result,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
    });

    return result;
  } catch (err) {
    log.error('Stage 2 classifier error', { err, durationMs: Date.now() - start });
    return false;
  }
}
