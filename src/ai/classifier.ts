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

function hasPumpFunLink(tweetText: string, ocrText: string): boolean {
  const s = `${tweetText}\n${ocrText}`.toLowerCase();
  if (/\bpump\.fun\//.test(s)) return true;
  if (/(?:https?:\/\/)(?:www\.)?pump\.fun\b/.test(s)) return true;
  return false;
}

export async function classifyLaunchTiming(
  tweetText: string,
  ocrText: string
): Promise<LaunchTiming> {
  if (hasPumpFunLink(tweetText, ocrText)) {
    log.debug('Launch timing: pump.fun URL → live (heuristic)');
    return 'live';
  }

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

export async function isShillTweet(
  tweetText: string,
  ocrText: string
): Promise<boolean> {
  const userContent = [
    `Is this tweet a shill, bot-bait, or spam? Reply with only "YES" or "NO".`,
    ``,
    `Say YES if the tweet:`,
    `- Reads like a keyword list or hashtag dump rather than a real announcement`,
    `- Uses pipe separators, slash lists, or bullet-like formatting to cram in multiple launch keywords`,
    `- Has no real sentence structure — just tokens, buzzwords, and ticker symbols strung together`,
    `- Appears designed to trigger keyword-monitoring bots rather than inform humans`,
    `- Promotes buying a token rather than announcing a project milestone`,
    ``,
    `Say NO if the tweet:`,
    `- Is a genuine, human-readable announcement from a project or community member`,
    `- Contains actual information about a launch (date, chain, features, links)`,
    `- Reads like something a real person would write to inform their followers`,
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

    const usage = response.usage as {
      input_tokens?: number; output_tokens?: number;
      prompt_tokens?: number; completion_tokens?: number;
    } | undefined;

    log.debug('Shill detection result', {
      result,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
    });

    return result;
  } catch (err) {
    log.error('Shill detector error', { err, durationMs: Date.now() - start });
    return false; // safe default: don't discard on error
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
