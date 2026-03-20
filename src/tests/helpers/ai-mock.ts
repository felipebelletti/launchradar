import { vi } from 'vitest';
import type { ExtractionResult } from '../../types/index.js';

interface QueuedResponse {
  output_text: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const responseQueue: QueuedResponse[] = [];
const callLog: Array<{ model: string; system: string; userContent: string }> = [];

const mockResponsesCreate = vi.fn().mockImplementation(
  async (params: {
    model: string;
    max_output_tokens?: number;
    input: Array<{ role: string; content: string }>;
  }) => {
    const userMsg = params.input?.find(m => m.role === 'user');
    const systemMsg = params.input?.find(m => m.role === 'system');
    const userContent = userMsg?.content ?? '';
    callLog.push({
      model: params.model,
      system: systemMsg?.content ?? '',
      userContent,
    });

    const next = responseQueue.shift();
    if (!next) {
      throw new Error(
        `AI Mock: No response queued. Call log has ${callLog.length} calls. ` +
        `Model: ${params.model}, Content starts with: "${userContent.slice(0, 80)}..."`
      );
    }
    return {
      output_text: next.output_text,
      usage: next.usage ?? { input_tokens: 0, output_tokens: 0 },
    };
  }
);

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      responses = { create: mockResponsesCreate };
      constructor(_opts?: Record<string, unknown>) {}
    },
  };
});

export function getAiCallLog() {
  return callLog;
}

export function getAiCallCount(): number {
  return callLog.length;
}

export function resetAiMock(): void {
  responseQueue.length = 0;
  callLog.length = 0;
  mockResponsesCreate.mockClear();
}

export function mockStage1Yes(): void {
  responseQueue.push({ output_text: 'YES' });
}

export function mockStage1No(): void {
  responseQueue.push({ output_text: 'NO' });
}

export function mockStage2Yes(): void {
  responseQueue.push({ output_text: 'YES' });
}

export function mockStage2No(): void {
  responseQueue.push({ output_text: 'NO' });
}

export function mockCancellationYes(): void {
  responseQueue.push({ output_text: 'YES' });
}

export function mockCancellationNo(): void {
  responseQueue.push({ output_text: 'NO' });
}

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

  responseQueue.push({ output_text: JSON.stringify(result) });
}

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

export function assertNoAiCallForModel(model: string): boolean {
  return !callLog.some(call => call.model === model);
}

export function getRemainingQueuedResponses(): number {
  return responseQueue.length;
}
