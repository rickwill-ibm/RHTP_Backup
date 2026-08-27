/**
 * S1 — RasterizeProvider seam (scanned-PDF path). Rendering a PDF page to an image needs a
 * canvas, which in Node means a NATIVE dependency (@napi-rs/canvas). That must never sit in
 * the mandatory install path, so it lives behind this seam exactly like the OcrEngine: a
 * deterministic fake drives the unit gate, and the real rasterizer lazy-loads pdfjs-dist +
 * @napi-rs/canvas via runtime string-cast imports so tsc/vitest stay green with neither
 * package installed. A scanned PDF with no rasterizer FAILS CLOSED in pdf.ts.
 */

export interface RasterPage {
  page: number; // 1-based
  image: Uint8Array; // encoded image bytes (PNG)
  mime: string; // 'image/png'
  width: number;
  height: number;
}

export interface RasterizeProvider {
  readonly name: string;
  rasterize(pdf: Uint8Array, opts?: { dpi?: number }): Promise<RasterPage[]>;
}

/** Deterministic fake for unit tests — hands back pre-baked page images. */
export function fakeRasterizer(pages: RasterPage[]): RasterizeProvider {
  return {
    name: 'fake',
    async rasterize(): Promise<RasterPage[]> {
      return pages;
    },
  };
}

// Minimal local shapes of the optional deps (kept local so tsc needs neither installed).
interface PdfjsPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: unknown; viewport: unknown }): { promise: Promise<void> };
}
interface PdfjsDoc {
  numPages: number;
  getPage(n: number): Promise<PdfjsPage>;
}
interface PdfjsModule {
  getDocument(o: { data: Uint8Array }): { promise: Promise<PdfjsDoc> };
}
interface CanvasModule {
  createCanvas(
    w: number,
    h: number
  ): {
    getContext(t: '2d'): unknown;
    width: number;
    height: number;
    toBuffer(mime: string): Uint8Array;
  };
}

/** Real rasterizer via pdfjs-dist + @napi-rs/canvas. Lazily loaded; native, optional. */
export function pdfjsRasterizer(opts: { dpi?: number } = {}): RasterizeProvider {
  const dpi = opts.dpi ?? 200;
  return {
    name: 'pdfjs+napi-canvas',
    async rasterize(pdf: Uint8Array): Promise<RasterPage[]> {
      const pdfjsSpec = 'pdfjs-dist/legacy/build/pdf.mjs';
      const canvasSpec = '@napi-rs/canvas';
      const pdfjs = (await import(pdfjsSpec as string)) as unknown as PdfjsModule;
      const canvasMod = (await import(canvasSpec as string)) as unknown as CanvasModule;
      const doc = await pdfjs.getDocument({ data: pdf }).promise;
      const scale = dpi / 72;
      const pages: RasterPage[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale });
        const canvas = canvasMod.createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height)
        );
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        pages.push({
          page: n,
          image: canvas.toBuffer('image/png'),
          mime: 'image/png',
          width: canvas.width,
          height: canvas.height,
        });
      }
      return pages;
    },
  };
}
