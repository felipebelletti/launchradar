import { vi } from 'vitest';
import type { ExtractionResult } from '../../types/index.js';

/**
 * AI Mock — intercepts the Anthropic SDK at module level.
 *
 * All calls to `client.messages.create()` go through `mockMessagesCreate`,
 * which pulls responses from a FIFO queue. Tests push responses in the order
 * the pipeline will call them (Stage 1 → Stage 2 → Extractor, etc.).
 */

interface QueuedResponse {
  content: Array<{ type: 'text'; text: string }>;
}

const responseQueue: QueuedResponse[] = [];
const callLog: Array<{ model: string; system: string; userContent: string }> = [];

const mockMessagesCreate = vi.fn().mockImplementation(
  async (params: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: string; content: string }>;
  }) => {
    const userContent = params.messages[0]?.content ?? '';
    callLog.push({
      model: params.model,
      system: params.system,
      userContent,
    });

    const next = responseQueue.shift();
    if (!next) {
      throw new Error(
        `AI Mock: No response queued. Call log has ${callLog.length} calls. ` +
        `Model: ${params.model}, Content starts with: "${userContent.slice(0, 80)}..."`
      );
    }
    return next;
  }
);

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockMessagesCreate };
      constructor(_opts?: Record<string, unknown>) {}
    },
  };
});

// --- Public API ---

export function getAiCallLog() {
  return callLog;
}

export function getAiCallCount(): number {
  return callLog.length;
}

export function resetAiMock(): void {
  responseQueue.length = 0;
  callLog.length = 0;
  mockMessagesCreate.mockClear();
}

/** Queue a Stage 1 YES response (is a launch announcement). */
export function mockStage1Yes(): void {
  responseQueue.push({ content: [{ type: 'text', text: 'YES' }] });
}

/** Queue a Stage 1 NO response (not a launch). */
export function mockStage1No(): void {
  responseQueue.push({ content: [{ type: 'text', text: 'NO' }] });
}

/** Queue a Stage 2 YES response (is crypto). */
export function mockStage2Yes(): void {
  responseQueue.push({ content: [{ type: 'text', text: 'YES' }] });
}

/** Queue a Stage 2 NO response (not crypto). */
export function mockStage2No(): void {
  responseQueue.push({ content: [{ type: 'text', text: 'NO' }] });
}

/** Queue a cancellation detector YES response. */
export function mockCancellationYes(): void {
  responseQueue.push({ content: [{ type: 'text', text: 'YES' }] });
}

/** Queue a cancellation detector NO response. */
export function mockCancellationNo(): void {
  responseQueue.push({ content: [{ type: 'text', text: 'NO' }] });
}

/** Queue an extractor (Stage 3) response with the given fields. */
export function mockExtractor(fields: {
  projectName?: string;
  ticker?: string;
  launchDate?: string;
  launchDateRaw?: string;
  launchType?: string;
  chain?: string;
  category?: string;
  website?: string;
  summary?: string;
  confidence?: Partial<Record<keyof ExtractionResult, number>>;
}): void {
  const conf = fields.confidence ?? {};

  const result: Record<string, { value: string | null; confidence: number }> = {
    projectName: { value: fields.projectName ?? null, confidence: conf.projectName ?? (fields.projectName ? 0.95 : 0) },
    ticker: { value: fields.ticker ?? null, confidence: conf.ticker ?? (fields.ticker ? 0.9 : 0) },
    launchDate: { value: fields.launchDate ?? null, confidence: conf.launchDate ?? (fields.launchDate ? 0.85 : 0) },
    launchDateRaw: { value: fields.launchDateRaw ?? null, confidence: conf.launchDateRaw ?? (fields.launchDateRaw ? 0.8 : 0) },
    launchType: { value: fields.launchType ?? null, confidence: conf.launchType ?? (fields.launchType ? 0.9 : 0) },
    chain: { value: fields.chain ?? null, confidence: conf.chain ?? (fields.chain ? 0.9 : 0) },
    category: { value: fields.category ?? null, confidence: conf.category ?? (fields.category ? 0.85 : 0) },
    website: { value: fields.website ?? null, confidence: conf.website ?? (fields.website ? 0.9 : 0) },
    summary: { value: fields.summary ?? null, confidence: conf.summary ?? (fields.summary ? 0.8 : 0) },
  };

  responseQueue.push({
    content: [{ type: 'text', text: JSON.stringify(result) }],
  });
}

/**
 * Assert that the AI call log contains a call matching the given criteria.
 */
export function assertAiCallMade(criteria: {
  model?: string;
  contentIncludes?: string;
}): boolean {
  return callLog.some(call => {
    if (criteria.model && call.model !== criteria.model) return false;
    if (criteria.contentIncludes && !call.userContent.includes(criteria.contentIncludes)) return false;
    return true;
  });
}

/**
 * Assert that NO AI call was made with the given model.
 */
export function assertNoAiCallForModel(model: string): boolean {
  return !callLog.some(call => call.model === model);
}

/**
 * Get remaining queued responses (useful for asserting mocks were consumed).
 */
export function getRemainingQueuedResponses(): number {
  return responseQueue.length;
}
