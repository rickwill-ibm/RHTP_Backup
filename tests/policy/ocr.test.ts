/**
 * OCR seam — pluggable external-service provider. Proves: default refuses (never guesses),
 * env selects the HTTP provider, the HTTP provider posts + reads text, and error paths throw
 * clearly. No real network — fetch is stubbed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  selectOcrProvider,
  httpOcrProvider,
  noneOcrProvider,
  ocrConfigFromEnv,
  OcrNotConfiguredError,
} from '@/lib/policy/server/ocr';

const req = { bytes: new Uint8Array([1, 2, 3]), filename: 'scan.pdf', mimeType: 'application/pdf' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OCR seam', () => {
  it('defaults to the "none" provider, which refuses instead of guessing', async () => {
    expect(noneOcrProvider.id).toBe('none');
    await expect(noneOcrProvider.ocr(req)).rejects.toBeInstanceOf(OcrNotConfiguredError);
    // no env → selectOcrProvider yields the none provider
    expect(selectOcrProvider({}).id).toBe('none');
  });

  it('env config selects the HTTP provider', () => {
    const cfg = ocrConfigFromEnv({ OCR_ENDPOINT: 'https://ocr.example/scan', OCR_API_KEY: 'k' });
    expect(cfg.endpoint).toBe('https://ocr.example/scan');
    expect(selectOcrProvider(cfg).id).toBe('http');
  });

  it('OCR_PROVIDER=tesseract selects the in-app tesseract provider', () => {
    const cfg = ocrConfigFromEnv({ OCR_PROVIDER: 'tesseract' });
    expect(selectOcrProvider(cfg).id).toBe('tesseract');
  });

  it('the HTTP provider POSTs the bytes and returns recognized text', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ text: 'Medically Necessary: A. Member is age 18 or older.', pages: 3 }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = httpOcrProvider({ endpoint: 'https://ocr.example/scan', apiKey: 'secret' });
    const result = await provider.ocr(req);

    expect(result.text).toMatch(/Medically Necessary/);
    expect(result.provider).toBe('http');
    expect(result.pages).toBe(3);
    // posted to the endpoint with auth + the raw bytes
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ocr.example/scan');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret');
    expect(init.body).toBe(req.bytes);
  });

  it('supports a custom response text field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ content: 'hello' }) }))
    );
    const provider = httpOcrProvider({ endpoint: 'https://x', textField: 'content' });
    expect((await provider.ocr(req)).text).toBe('hello');
  });

  it('throws a clear error on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom', statusText: 'err' }))
    );
    const provider = httpOcrProvider({ endpoint: 'https://x' });
    await expect(provider.ocr(req)).rejects.toThrow(/OCR service returned 500/);
  });

  it('throws when the response lacks the expected text field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }))
    );
    const provider = httpOcrProvider({ endpoint: 'https://x' });
    await expect(provider.ocr(req)).rejects.toThrow(/missing string field "text"/);
  });
});
