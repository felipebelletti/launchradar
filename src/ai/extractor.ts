import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { createChildLogger } from '../logger.js';
import type { ExtractionResult } from '../types/index.js';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
const log = createChildLogger('ai:extractor');

const EXTRACTOR_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a structured data extraction engine for a crypto launch monitoring platform.
Given raw content about a potential crypto project launch, extract all available structured fields.
Always respond with valid JSON only — no markdown, no explanation, just the JSON object.`;

const USER_PROMPT_TEMPLATE = `Extract structured launch data from the following content. Return a JSON object with this exact schema:

{
  "projectName": { "value": string | null, "confidence": number },
  "ticker": { "value": string | null, "confidence": number },
  "launchDate": { "value": string | null, "confidence": number },
  "launchDateRaw": { "value": string | null, "confidence": number },
  "launchType": { "value": "presale" | "airdrop" | "mainnet" | "mint" | "testnet" | "tge" | null, "confidence": number },
  "chain": { "value": string | null, "confidence": number },
  "category": { "value": "DeFi" | "NFT" | "L2" | "GameFi" | "Meme" | "Infrastructure" | "Other" | null, "confidence": number },
  "website": { "value": string | null, "confidence": number },
  "summary": { "value": string | null, "confidence": number }
}

Rules:
- confidence is a float from 0 to 1 (1 = certain, 0 = guessing)
- launchDate value should be an ISO 8601 date string if parseable, otherwise null
- launchDateRaw is the raw date text from the content (e.g. "end of March", "Q2 2025")
- ticker should be uppercase, without the $ prefix
- If a field cannot be determined, set value to null and confidence to 0
- For summary, write a 1-2 sentence description of the project and its launch

Content to analyze:
---
Tweet: {TWEET_TEXT}
---
Author bio: {AUTHOR_BIO}
---
{OCR_SECTION}
{WEBSITE_SECTION}`;

function buildPrompt(
  tweetText: string,
  authorBio: string,
  ocrText: string,
  websiteContent?: string
): string {
  const ocrSection = ocrText
    ? `Image text extracted via OCR:\n${ocrText}\n---`
    : '';
  const websiteSection = websiteContent
    ? `Website content:\n${websiteContent.slice(0, 3000)}\n---`
    : '';

  return USER_PROMPT_TEMPLATE
    .replace('{TWEET_TEXT}', tweetText)
    .replace('{AUTHOR_BIO}', authorBio || 'N/A')
    .replace('{OCR_SECTION}', ocrSection)
    .replace('{WEBSITE_SECTION}', websiteSection);
}

function parseExtractionResponse(raw: string): ExtractionResult {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  const parsed: unknown = JSON.parse(cleaned);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Extraction response is not an object');
  }

  const obj = parsed as Record<string, unknown>;

  function getField(key: string): { value: string | null; confidence: number } {
    const field = obj[key];
    if (typeof field === 'object' && field !== null) {
      const f = field as Record<string, unknown>;
      return {
        value: typeof f['value'] === 'string' ? f['value'] : null,
        confidence: typeof f['confidence'] === 'number' ? f['confidence'] : 0,
      };
    }
    return { value: null, confidence: 0 };
  }

  return {
    projectName: getField('projectName'),
    ticker: getField('ticker'),
    launchDate: getField('launchDate'),
    launchDateRaw: getField('launchDateRaw'),
    launchType: getField('launchType'),
    chain: getField('chain'),
    category: getField('category'),
    website: getField('website'),
    summary: getField('summary'),
  };
}

/**
 * Stage 3: Structured data extraction.
 * Uses claude-sonnet-4-6 — only call this AFTER tweets pass Stage 1 + Stage 2 (or are Tier A/C).
 */
export async function extractLaunchData(
  tweetText: string,
  authorBio: string,
  ocrText: string,
  websiteContent?: string
): Promise<ExtractionResult> {
  const prompt = buildPrompt(tweetText, authorBio, ocrText, websiteContent);

  const start = Date.now();
  log.info('Anthropic API call', {
    call: 'stage3_extraction',
    model: EXTRACTOR_MODEL,
    tweetPreview: tweetText.slice(0, 80),
  });

  try {
    const response = await client.messages.create({
      model: EXTRACTOR_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText =
      response.content[0].type === 'text' ? response.content[0].text : '{}';
    const result = parseExtractionResponse(rawText);

    log.info('Anthropic API response', {
      call: 'stage3_extraction',
      model: EXTRACTOR_MODEL,
      durationMs: Date.now() - start,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      projectName: result.projectName.value,
    });

    return result;
  } catch (err) {
    log.error('Stage 3 extractor error', { err, durationMs: Date.now() - start });
    // Return empty extraction on failure
    const emptyField = { value: null, confidence: 0 };
    return {
      projectName: emptyField,
      ticker: emptyField,
      launchDate: emptyField,
      launchDateRaw: emptyField,
      launchType: emptyField,
      chain: emptyField,
      category: emptyField,
      website: emptyField,
      summary: emptyField,
    };
  }
}
