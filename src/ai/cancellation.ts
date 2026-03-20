import { xaiClient, GROK_MODEL } from './client.js';
import { prisma } from '../db/client.js';
import { publishEvent } from '../events/publisher.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('ai:cancellation');

export async function isCancellationSignal(tweetText: string): Promise<boolean> {
  const userContent = `Does this tweet indicate that a previously announced project launch has been delayed, postponed, cancelled, or that the project has been abandoned or rugged? Reply with only "YES" or "NO".

Tweet: "${tweetText}"`;

  const start = Date.now();
  log.info('xAI API call', {
    call: 'cancellation_detector',
    model: GROK_MODEL,
    tweetPreview: tweetText.slice(0, 80),
  });

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
    log.info('xAI API response', {
      call: 'cancellation_detector',
      model: GROK_MODEL,
      result,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
    });

    return result;
  } catch (err) {
    log.error('Cancellation detector error', { err, durationMs: Date.now() - start });
    return false;
  }
}

/**
 * Check a tweet for cancellation signals and transition the record if detected.
 */
export async function checkAndCancelLaunch(
  tweetText: string,
  launchRecordId: string
): Promise<boolean> {
  const cancelled = await isCancellationSignal(tweetText);
  if (!cancelled) return false;

  const updated = await prisma.launchRecord.update({
    where: { id: launchRecordId },
    data: { status: 'CANCELLED' },
  });

  log.info('Launch record cancelled', { launchRecordId });
  await publishEvent({ type: 'launch:cancelled', payload: { id: updated.id } });

  return true;
}
