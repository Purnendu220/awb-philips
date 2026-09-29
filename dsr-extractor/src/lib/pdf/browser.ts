import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Worker as OcrWorker } from 'tesseract.js';
import type { DocText } from '../types';
import { extractDocText, type OcrResult, type ProgressFn } from './extract';
import type { OcrWord } from './layout';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

let ocrWorker: Promise<OcrWorker> | null = null;
let ocrProgress: ((p: number) => void) | undefined;

function asset(path: string): string {
  return new URL(path, document.baseURI).href;
}

function getOcrWorker(): Promise<OcrWorker> {
  ocrWorker ??= import('tesseract.js').then(async ({ createWorker }) => {
    const w = await createWorker('eng', 1, {
      workerPath: asset('ocr/worker.min.js'),
      corePath: asset('ocr/core'),
      langPath: asset('ocr/lang'),
      gzip: true,
      logger: (m) => {
        if (m.status === 'recognizing text') ocrProgress?.(m.progress);
      },
    });
    await w.setParameters({ preserve_interword_spaces: '1' });
    return w;
  });
  ocrWorker.catch(() => (ocrWorker = null));
  return ocrWorker;
}

async function ocr(image: unknown, onProgress?: (p: number) => void): Promise<OcrResult> {
  const w = await getOcrWorker();
  ocrProgress = onProgress;
  try {
    const { data } = await w.recognize(image as HTMLCanvasElement, {}, { blocks: true, text: false });
    const lines: OcrWord[][] = [];
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines) lines.push(l.words.map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })));
    return { lines, confidence: data.confidence };
  } finally {
    ocrProgress = undefined;
  }
}

export async function extractFile(file: File, onProgress?: ProgressFn): Promise<DocText> {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const pdf = await task.promise;
  try {
    return await extractDocText(
      pdf,
      {
        transform: (a, b) => pdfjs.Util.transform(a, b),
        async renderPage(page, scale) {
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          return canvas;
        },
        ocr,
      },
      onProgress,
    );
  } finally {
    await task.destroy();
  }
}
