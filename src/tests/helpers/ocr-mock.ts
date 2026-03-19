import { vi } from 'vitest';

const recognizeMock = vi.fn().mockResolvedValue({ data: { text: '' } });

vi.mock('tesseract.js', () => {
  return {
    default: {
      recognize: recognizeMock,
    },
  };
});

export function getTesseractMock() {
  return recognizeMock;
}

export function resetOcrMock(): void {
  recognizeMock.mockReset();
  recognizeMock.mockResolvedValue({ data: { text: '' } });
}

export function mockOcrResult(text: string): void {
  recognizeMock.mockResolvedValueOnce({ data: { text } });
}

export function mockOcrFailure(error?: Error): void {
  recognizeMock.mockRejectedValueOnce(error ?? new Error('Tesseract timeout'));
}
