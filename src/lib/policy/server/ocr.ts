/**
 * OCR seam — turn a scanned / image-only PDF into text via an EXTERNAL OCR service.
 *
 * Pluggable by design: any OCR service (AWS Textract, Azure Document Intelligence, Google
 * Document AI, a Claude-vision endpoint, or a self-hosted OCR microservice) sits behind ONE
 * interface. This app stays service-agnostic — it POSTs the document to a configured endpoint
 * and reads back text. The default provider is "none" (throws OcrNotConfiguredError) so a
 * scanned document is never silently guessed; wire a real provider via env:
 *   OCR_ENDPOINT   — URL that accepts the document bytes and returns JSON { text }
 *   OCR_API_KEY    — optional bearer token
 *   OCR_TEXT_FIELD — optional JSON field name to read the text from (default "text")
 *
 * SERVER ONLY: import from API routes / server modules, never from a client component.
 */

export interface OcrRequest {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

export interface OcrResult {
  text: string;
  provider: string;
  pages?: number | null;
}

export interface OcrProvider {
  readonly id: string;
  ocr(req: OcrRequest): Promise<OcrResult>;
}

export class OcrNotConfiguredError extends Error {
  constructor(
    message = 'No OCR provider configured — set OCR_ENDPOINT to enable scanned-PDF ingest.'
  ) {
    super(message);
    this.name = 'OcrNotConfiguredError';
  }
}

/** The default provider: refuses rather than guessing. */
export const noneOcrProvider: OcrProvider = {
  id: 'none',
  ocr(): Promise<OcrResult> {
    return Promise.reject(new OcrNotConfiguredError());
  },
};

export interface HttpOcrConfig {
  endpoint: string;
  apiKey?: string;
  /** JSON field the service returns its recognized text in. Default "text". */
  textField?: string;
  id?: string;
}

/**
 * Generic HTTP OCR provider: POSTs the raw document bytes to an external endpoint and reads
 * back the recognized text. Put any concrete service (Textract / Azure / Document AI / a
 * Claude-vision worker) behind a thin adapter at `endpoint` that accepts a document and
 * returns `{ text }`. This keeps the app itself free of any single vendor SDK.
 */
export function httpOcrProvider(config: HttpOcrConfig): OcrProvider {
  const textField = config.textField ?? 'text';
  const id = config.id ?? 'http';
  return {
    id,
    async ocr(req: OcrRequest): Promise<OcrResult> {
      const headers: Record<string, string> = {
        'content-type': req.mimeType || 'application/pdf',
        'x-filename': req.filename,
      };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: req.bytes as BodyInit,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`OCR service returned ${res.status}: ${detail.slice(0, 200)}`);
      }
      const body = (await res.json()) as Record<string, unknown>;
      const text = body[textField];
      if (typeof text !== 'string') {
        throw new Error(`OCR service response missing string field "${textField}"`);
      }
      const pages = typeof body.pages === 'number' ? body.pages : null;
      return { text, provider: id, pages };
    },
  };
}

export interface TesseractConfig {
  /** OCR language(s), e.g. "eng". Default "eng". */
  lang?: string;
  /** Render DPI for page rasterization. Default 150. */
  dpi?: number;
  /** Cap pages OCR'd (0/undefined = all). Guards runaway cost on huge scans. */
  maxPages?: number;
}

/**
 * In-app OCR via tesseract.js — one more wireable option, no external service. Renders each
 * PDF page (via unpdf) and OCRs it. tesseract.js is loaded LAZILY (dynamic import) so it is
 * only a dependency when this provider is actually selected; if it isn't installed the provider
 * throws an actionable error rather than breaking the build.
 *
 * NOTE: runtime requires `npm i tesseract.js` and a Node canvas backend for unpdf rendering;
 * verify on the target machine (it can't be exercised from the pure verify project).
 */
export function tesseractOcrProvider(config: TesseractConfig = {}): OcrProvider {
  return {
    id: 'tesseract',
    async ocr(req: OcrRequest): Promise<OcrResult> {
      const tesseractSpecifier = 'tesseract.js';
      let tesseract: {
        createWorker: (lang?: string) => Promise<{
          recognize: (img: Uint8Array | Buffer) => Promise<{ data: { text: string } }>;
          terminate: () => Promise<void>;
        }>;
      };
      try {
        tesseract = (await import(/* @vite-ignore */ tesseractSpecifier)) as typeof tesseract;
      } catch {
        throw new Error(
          'Tesseract OCR selected (OCR_PROVIDER=tesseract) but tesseract.js is not installed — run `npm i tesseract.js`, or use OCR_PROVIDER=http with an external service.'
        );
      }
      const unpdf = (await import('unpdf')) as unknown as {
        getDocumentProxy: (b: Uint8Array) => Promise<{ numPages: number }>;
        renderPageAsImage: (
          b: Uint8Array,
          page: number,
          opts?: { scale?: number }
        ) => Promise<ArrayBuffer | Uint8Array>;
      };
      if (typeof unpdf.renderPageAsImage !== 'function') {
        throw new Error(
          'unpdf.renderPageAsImage unavailable — update unpdf to enable Tesseract OCR.'
        );
      }
      const doc = await unpdf.getDocumentProxy(req.bytes);
      const total = doc.numPages;
      const limit =
        config.maxPages && config.maxPages > 0 ? Math.min(total, config.maxPages) : total;
      const scale = (config.dpi ?? 150) / 72;
      const worker = await tesseract.createWorker(config.lang ?? 'eng');
      try {
        const parts: string[] = [];
        for (let page = 1; page <= limit; page += 1) {
          const img = await unpdf.renderPageAsImage(req.bytes, page, { scale });
          const { data } = await worker.recognize(new Uint8Array(img as ArrayBuffer));
          parts.push(data.text);
        }
        return { text: parts.join('\n'), provider: 'tesseract', pages: limit };
      } finally {
        await worker.terminate();
      }
    },
  };
}

export interface OcrConfig {
  /** 'none' | 'http' | 'tesseract'. Defaults to 'http' when an endpoint is set, else 'none'. */
  provider?: string;
  endpoint?: string;
  apiKey?: string;
  textField?: string;
  dpi?: number;
  maxPages?: number;
  lang?: string;
}

/** Read OCR config from the environment. */
export function ocrConfigFromEnv(env: Record<string, string | undefined> = process.env): OcrConfig {
  const num = (v: string | undefined): number | undefined => {
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    provider: env.OCR_PROVIDER?.trim().toLowerCase() || undefined,
    endpoint: env.OCR_ENDPOINT?.trim() || undefined,
    apiKey: env.OCR_API_KEY?.trim() || undefined,
    textField: env.OCR_TEXT_FIELD?.trim() || undefined,
    dpi: num(env.OCR_DPI),
    maxPages: num(env.OCR_MAX_PAGES),
    lang: env.OCR_LANG?.trim() || undefined,
  };
}

/**
 * Select the OCR provider from config. Every engine is a configuration choice:
 *   OCR_PROVIDER=http      + OCR_ENDPOINT  → external service (Textract/Azure/Document AI/…)
 *   OCR_PROVIDER=tesseract                 → in-app tesseract.js
 *   (unset)                                → 'http' if OCR_ENDPOINT is set, else 'none'
 * The "none" provider refuses (catchably) so a scan is never silently guessed.
 */
export function selectOcrProvider(config: OcrConfig = ocrConfigFromEnv()): OcrProvider {
  const provider = config.provider ?? (config.endpoint ? 'http' : 'none');
  if (provider === 'tesseract') {
    return tesseractOcrProvider({ lang: config.lang, dpi: config.dpi, maxPages: config.maxPages });
  }
  if (provider === 'http') {
    if (!config.endpoint) return noneOcrProvider;
    return httpOcrProvider({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      textField: config.textField,
    });
  }
  return noneOcrProvider;
}
