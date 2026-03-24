import Tesseract from 'tesseract.js';
import { createChildLogger } from '../logger.js';

const log = createChildLogger('ocr');

export async function ocrImageUrl(url: string): Promise<string> {
  const { data: { text } } = await Tesseract.recognize(url, 'eng');
  return text.trim();
}

export async function ocrTweetImages(imageUrls: string[]): Promise<string> {
  if (imageUrls.length === 0) return '';

  const results = await Promise.allSettled(
    imageUrls.slice(0, 3).map(ocrImageUrl)
  );

  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter(text => text.length > 0)
    .join('\n');
}

// Warm up Tesseract on startup with a 1x1 transparent PNG
export async function warmupTesseract(): Promise<void> {
  try {
    await Tesseract.recognize(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'eng'
    );
    log.info('Tesseract warmed up successfully');
  } catch {
    log.warn('Tesseract warm-up failed (non-fatal)');
  }
}
