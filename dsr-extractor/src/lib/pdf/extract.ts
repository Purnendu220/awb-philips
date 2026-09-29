import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { DocText, PageText, TextItem } from '../types';
import { buildLines, linesFromOcr, type OcrWord } from './layout';

export interface OcrResult {
  lines: OcrWord[][];
  confidence: number;
}

/** Environment-specific pieces (browser canvas + worker vs. Node in tests). */
export interface ExtractDeps {
  transform(m1: number[], m2: number[]): number[];
  renderPage(page: PDFPageProxy, scale: number): Promise<unknown>;
  ocr(image: unknown, onProgress?: (p: number) => void): Promise<OcrResult>;
}

export type ProgressFn = (status: string, fraction: number) => void;

/** Pages with fewer visible characters than this are treated as scanned images. */
const MIN_TEXT_CHARS = 25;
/** Render scanned pages at ~300 dpi, capped so huge pages stay fast. */
const OCR_DPI = 300;
const OCR_MAX_PX = 2600;

export async function extractDocText(pdf: PDFDocumentProxy, deps: ExtractDeps, onProgress?: ProgressFn): Promise<DocText> {
  const pages: PageText[] = [];
  const n = pdf.numPages;
  for (let p = 1; p <= n; p++) {
    const base = (p - 1) / n;
    onProgress?.(`Reading page ${p} of ${n}`, base);
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of tc.items) {
      if (!('str' in it) || !it.str) continue;
      const tx = deps.transform(vp.transform, it.transform);
      const h = Math.hypot(tx[2], tx[3]);
      items.push({ str: it.str, x: tx[4], y: tx[5] - h, w: it.width, h });
    }
    const chars = items.reduce((s, i) => s + i.str.replace(/\s/g, '').length, 0);
    if (chars >= MIN_TEXT_CHARS) {
      pages.push({ width: vp.width, height: vp.height, method: 'text', items, lines: buildLines(items, p - 1) });
      continue;
    }
    onProgress?.(`Scanning page ${p} of ${n} (OCR)`, base);
    const scale = Math.min(OCR_DPI / 72, OCR_MAX_PX / Math.max(vp.width, vp.height));
    const image = await deps.renderPage(page, scale);
    const ocr = await deps.ocr(image, (f) => onProgress?.(`Scanning page ${p} of ${n} (OCR)`, base + f / n));
    const { lines, items: ocrItems } = linesFromOcr(ocr.lines, scale, p - 1);
    pages.push({ width: vp.width, height: vp.height, method: 'ocr', items: ocrItems, lines, confidence: ocr.confidence });
    page.cleanup();
  }
  onProgress?.('Done', 1);
  return { pages };
}
