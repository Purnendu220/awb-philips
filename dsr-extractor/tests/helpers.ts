import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker, type Worker } from 'tesseract.js';
import { extractDocText, type OcrResult } from '../src/lib/pdf/extract';
import type { OcrWord } from '../src/lib/pdf/layout';
import type { DocText } from '../src/lib/types';

export const FIXTURES = join(__dirname, 'fixtures');
const CACHE = join(__dirname, '..', '.scratch', 'ocr-cache');

let worker: Promise<Worker> | null = null;

async function runOcr(image: Buffer): Promise<OcrResult> {
  worker ??= createWorker('eng', 1, {
    langPath: join(__dirname, '..', 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int'),
    cachePath: CACHE,
    gzip: true,
  }).then(async (w) => {
    await w.setParameters({ preserve_interword_spaces: '1' });
    return w;
  });
  const w = await worker;
  const { data } = await w.recognize(image, {}, { blocks: true, text: false });
  const lines: OcrWord[][] = [];
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs) for (const l of p.lines) lines.push(l.words.map((x) => ({ text: x.text, confidence: x.confidence, bbox: x.bbox })));
  return { lines, confidence: data.confidence };
}

/**
 * Runs the real extraction pipeline in Node: pdf.js text layer + page rendering
 * with @napi-rs/canvas + Tesseract. Raw OCR output is cached (it takes seconds
 * per page); set FRESH=1 to re-run OCR.
 */
export async function loadDocText(file: string): Promise<DocText> {
  const cacheFile = join(CACHE, file + '.json');
  const cached: OcrResult[] | null = !process.env.FRESH && existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : null;
  const fresh: OcrResult[] = [];

  const data = new Uint8Array(readFileSync(join(FIXTURES, file)));
  const task = pdfjs.getDocument({ data, verbosity: 0 });
  const pdf = await task.promise;
  let ocrCall = 0;
  const doc = await extractDocText(pdf as never, {
    transform: (a, b) => pdfjs.Util.transform(a, b),
    async renderPage(page, scale) {
      if (cached) return null;
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas: canvas as never, canvasContext: ctx as never, viewport }).promise;
      return canvas.toBuffer('image/png');
    },
    async ocr(image) {
      const i = ocrCall++;
      if (cached?.[i]) return cached[i];
      const r = await runOcr(image as Buffer);
      fresh.push(r);
      return r;
    },
  });
  await task.destroy();
  if (!cached && fresh.length) {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(fresh));
  }
  return doc;
}

export async function closeOcr() {
  if (worker) await (await worker).terminate();
  worker = null;
}
