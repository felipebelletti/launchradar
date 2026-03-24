import OpenAI from 'openai';
import { config } from '../config.js';

export const xaiClient = new OpenAI({
  apiKey: config.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

export const GROK_MODEL = 'grok-4-1-fast-non-reasoning';
