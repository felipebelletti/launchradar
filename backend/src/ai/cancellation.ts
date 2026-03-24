import { xaiClient, GROK_MODEL } from './client.js';
import { prisma } from '../db/client.js';
import { publishEvent } from '../events/publisher.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('ai:cancellation');

export type LaunchDisruptionType = 'postponed' | 'cancelled' | 'none';

/**
 * Classify whether a tweet signals a postponement, cancellation, or neither.
 *
 * - "postponed" = delayed/pushed back but project is still alive (date changed or TBD)
 * - "cancelled" = project abandoned, rugged, shut down, or permanently killed
 * - "none" = no disruption signal
 */
export async function classifyDisruption(tweetText: string): Promise<LaunchDisruptionType> {
  const userContent = [
    `Classify this tweet. Reply with only one word: "postponed", "cancelled", or "none".`,
    ``,
    `Say "postponed" if the tweet indicates a launch has been delayed, pushed back, or rescheduled — the project is still happening but the date changed or is now TBD.`,
    `Say "cancelled" if the tweet indicates the project has been abandoned, rugged, shut down, or permanently killed.`,
    `Say "none" if the tweet does not indicate any disruption to a previously announced launch.`,
    ``,
    `Tweet: "${tweetText}"`,
  ].join('\n');

  const start = Date.now();
  log.info('xAI API call', {
    call: 'disruption_classifier',
    model: GROK_MODEL,
    tweetPreview: tweetText.slice(0, 80),
  });

  try {
    const response = await xaiClient.responses.create({
      model: GROK_MODEL,
      max_output_tokens: 5,
      input: [
        { role: 'system', content: 'You are a classifier. Reply with only one word: "postponed", "cancelled", or "none".' },
        { role: 'user', content: userContent },
      ],
      store: false,
    });

    const text = (response.output_text ?? 'none').trim().toLowerCase();

    const usage = response.usage as {
      input_tokens?: number; output_tokens?: number;
      prompt_tokens?: number; completion_tokens?: number;
    } | undefined;
    log.info('xAI API response', {
      call: 'disruption_classifier',
      model: GROK_MODEL,
      result: text,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
    });

    if (text === 'postponed') return 'postponed';
    if (text === 'cancelled') return 'cancelled';
    return 'none';
  } catch (err) {
    log.error('Disruption classifier error', { err, durationMs: Date.now() - start });
    return 'none';
  }
}

/** @deprecated Use classifyDisruption instead. Kept for backward compatibility with tests. */
export async function isCancellationSignal(tweetText: string): Promise<boolean> {
  const result = await classifyDisruption(tweetText);
  return result === 'cancelled' || result === 'postponed';
}

/**
 * Check a tweet for disruption signals and handle accordingly:
 * - "postponed" → clear launch date, set rescheduledAt, keep record active
 * - "cancelled" → transition to CANCELLED status
 * - "none" → no change
 *
 * Returns true if a disruption was detected.
 */
export async function checkAndHandleDisruption(
  tweetText: string,
  launchRecordId: string
): Promise<boolean> {
  const disruption = await classifyDisruption(tweetText);

  if (disruption === 'none') return false;

  if (disruption === 'postponed') {
    const record = await prisma.launchRecord.findUnique({
      where: { id: launchRecordId },
    });

    const updateData: Record<string, unknown> = {
      launchDate: null,
      launchDateRaw: 'TBD (postponed)',
      launchDateConfidence: 0,
      rescheduledAt: new Date(),
    };

    // Preserve the old date in previousLaunchDate if one existed
    if (record?.launchDate) {
      updateData.previousLaunchDate = record.launchDate;
    }

    const updated = await prisma.launchRecord.update({
      where: { id: launchRecordId },
      data: updateData,
    });

    log.info('Launch postponed — date cleared', {
      launchRecordId,
      previousDate: record?.launchDate?.toISOString() ?? null,
    });
    await publishEvent({ type: 'launch:updated', payload: { ...updated } });
    return true;
  }

  // disruption === 'cancelled'
  const updated = await prisma.launchRecord.update({
    where: { id: launchRecordId },
    data: { status: 'CANCELLED' },
  });

  log.info('Launch record cancelled', { launchRecordId });
  await publishEvent({ type: 'launch:cancelled', payload: { id: updated.id } });
  return true;
}
