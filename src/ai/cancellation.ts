import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
const log = createChildLogger('ai:cancellation');

const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Cancellation detector: runs on Tier C follow-up tweets for existing records.
 * Detects "delayed", "postponed", "cancelled", or "rugged" signals.
 */
export async function isCancellationSignal(tweetText: string): Promise<boolean> {
  const userContent = `Does this tweet indicate that a previously announced project launch has been delayed, postponed, cancelled, or that the project has been abandoned or rugged? Reply with only "YES" or "NO".

Tweet: "${tweetText}"`;

  const start = Date.now();
  log.info('Anthropic API call', {
    call: 'cancellation_detector',
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
      call: 'cancellation_detector',
      model: CLASSIFIER_MODEL,
      result,
      durationMs: Date.now() - start,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });

    return result;
  } catch (err) {
    log.error('Cancellation detector error', { err, durationMs: Date.now() - start });
    return false;
  }
}
