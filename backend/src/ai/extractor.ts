import { xaiClient, GROK_MODEL } from './client.js';
import { createChildLogger } from '../logger.js';
import type { ExtractionResult } from '../types/index.js';

const log = createChildLogger('ai:extractor');

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
  "categories": { "value": ["Launchpad" | "NFT" | "Airdrop" | "Meme" | "GameFi" | "Celebrity" | "Utility" | "Other"], "confidence": number },
  "primaryCategory": { "value": "Launchpad" | "NFT" | "Airdrop" | "Meme" | "GameFi" | "Celebrity" | "Utility" | "Other" | null, "confidence": number },
  "website": { "value": string | null, "confidence": number },
  "summary": { "value": string | null, "confidence": number }
}

Rules:
- confidence is a float from 0 to 1 (1 = certain, 0 = guessing)
- launchDate and launchDateRaw are ONLY for the actual project/token LAUNCH — when the token goes live, the mint opens, the mainnet starts, or the presale begins.
- Do NOT use snapshot deadlines, airdrop eligibility cutoffs, whitelist closing times, or "drop your wallet" deadlines as launchDate. "Snapshot in 12 hours" is an eligibility deadline, NOT the launch date.
- If the tweet says "launching soon" but only gives a specific time for a snapshot/eligibility window, set launchDate to null (the launch date is unknown, only the snapshot time is known).
- If the text describes something ALREADY live, already listed, or past price action (e.g. "surged X%", "within 24 hours after launching", "gains", "JUST IN" price headlines), set launchDate and launchDateRaw to null with confidence 0. Do not treat performance time windows as launch dates.
- launchDate value should be an ISO 8601 date string if parseable, otherwise null
- The tweet was posted at {CURRENT_DATETIME}. Use this as the reference date/time to resolve relative time expressions like "in 3 hours", "tomorrow", "next week", "tonight", "at 5 PM UTC" into absolute ISO 8601 timestamps. Do NOT use the current wall-clock time — always anchor to the tweet's posted date
- launchDateRaw is the raw date text from the content (e.g. "end of March", "Q2 2025") — not phrases like "within 24 hours" when they refer to how long ago a pump happened
- ticker should be uppercase, without the $ prefix
- If a field cannot be determined, set value to null and confidence to 0
- website should be a real project domain (e.g. example.com). Never x.com or twitter.com as the project site. If the only link is t.co/..., output that URL (it is resolved server-side). If there is no usable link, use null
- For summary, write a 1-2 sentence description of the project and its launch
- categories should contain 1-3 applicable categories from the allowed list. A project can belong to multiple categories (e.g. an airdrop of a meme token is ["Airdrop", "Meme"])
- primaryCategory is the single most defining category and must also appear in categories
- Use "Launchpad" when the project is a launch venue, IDO/ICO platform, token launch host, or pump-style launch surface (the product is helping others launch tokens), not for a typical protocol that merely has a scheduled token launch
- Use "Airdrop" when the tweet is primarily about an airdrop distribution, token claim, or free token drop
- Use "Utility" when the project provides a real-world tool or service (e.g. AI-powered dev tools, analytics platforms, payment infrastructure) and does not fit better into another specific category. It is NOT a meme coin — it has tangible functionality behind the token
- Use "Celebrity" ONLY when a celebrity (someone famous outside crypto, e.g. Elon Musk, Snoop Dogg, Trump) has actively endorsed, created, or officially partnered with the project. Do NOT use "Celebrity" just because the project's account replies to, mentions, or tags celebrities — that is engagement farming, not a celebrity association

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
  websiteContent?: string,
  tweetCreatedAt?: Date
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
    .replace('{WEBSITE_SECTION}', websiteSection)
    .replace('{CURRENT_DATETIME}', (tweetCreatedAt ?? new Date()).toISOString());
}

function parseExtractionResponse(raw: string): ExtractionResult {
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

  function getArrayField(key: string): { value: string[]; confidence: number } {
    const field = obj[key];
    if (typeof field === 'object' && field !== null) {
      const f = field as Record<string, unknown>;
      let val: string[];
      if (Array.isArray(f['value'])) {
        val = f['value'].filter((v): v is string => typeof v === 'string');
      } else if (typeof f['value'] === 'string') {
        val = [f['value']];
      } else {
        val = [];
      }
      return {
        value: val,
        confidence: typeof f['confidence'] === 'number' ? f['confidence'] : 0,
      };
    }
    return { value: [], confidence: 0 };
  }

  return {
    projectName: getField('projectName'),
    ticker: getField('ticker'),
    launchDate: getField('launchDate'),
    launchDateRaw: getField('launchDateRaw'),
    launchType: getField('launchType'),
    chain: getField('chain'),
    categories: getArrayField('categories'),
    primaryCategory: getField('primaryCategory'),
    website: getField('website'),
    summary: getField('summary'),
  };
}

export async function extractLaunchData(
  tweetText: string,
  authorBio: string,
  ocrText: string,
  websiteContent?: string,
  tweetCreatedAt?: Date
): Promise<ExtractionResult> {
  const prompt = buildPrompt(tweetText, authorBio, ocrText, websiteContent, tweetCreatedAt);

  const start = Date.now();
  log.info('xAI API call', {
    call: 'stage3_extraction',
    model: GROK_MODEL,
    tweetPreview: tweetText.slice(0, 80),
  });

  try {
    const response = await xaiClient.responses.create({
      model: GROK_MODEL,
      max_output_tokens: 1024,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      store: false,
    });

    const rawText = response.output_text ?? '{}';
    const result = parseExtractionResponse(rawText);

    const usage = response.usage as { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    log.info('xAI API response', {
      call: 'stage3_extraction',
      model: GROK_MODEL,
      durationMs: Date.now() - start,
      inputTokens: usage?.input_tokens ?? usage?.prompt_tokens,
      outputTokens: usage?.output_tokens ?? usage?.completion_tokens,
      projectName: result.projectName.value,
    });

    return result;
  } catch (err) {
    log.error('Stage 3 extractor error', { err, durationMs: Date.now() - start });
    const emptyField = { value: null, confidence: 0 };
    return {
      projectName: emptyField,
      ticker: emptyField,
      launchDate: emptyField,
      launchDateRaw: emptyField,
      launchType: emptyField,
      chain: emptyField,
      categories: { value: [], confidence: 0 },
      primaryCategory: emptyField,
      website: emptyField,
      summary: emptyField,
    };
  }
}
