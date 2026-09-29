import type { Line, Segment, TextItem } from '../types';

/**
 * Forms filled by a line printer often put several fields in one text run,
 * separated by runs of spaces. Split those runs into separately positioned
 * items so each field keeps its own x coordinate.
 */
export function splitItem(it: TextItem): TextItem[] {
  const len = it.str.length;
  if (!len) return [];
  const charW = it.w / len;
  const out: TextItem[] = [];
  const re = /\S+(?: \S+)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(it.str))) {
    out.push({ str: m[0], x: it.x + m.index * charW, y: it.y, w: m[0].length * charW, h: it.h });
  }
  return out;
}

function joinSegs(segs: Segment[]): string {
  return segs.map((s) => s.text).join('   ');
}

/** Group positioned text items into reading-order lines of segments. */
export function buildLines(rawItems: TextItem[], page: number): Line[] {
  const items = rawItems.flatMap(splitItem).filter((i) => i.h > 0);
  items.sort((a, b) => a.y + a.h - (b.y + b.h) || a.x - b.x);

  // Only text of similar size shares a line: on printed forms the small
  // pre-printed labels often sit on the same baseline as the filled-in data.
  const groups: { base: number; h: number; h0: number; items: TextItem[] }[] = [];
  for (const it of items) {
    const base = it.y + it.h;
    const g = groups.find(
      (g) => Math.abs(g.base - base) <= 0.35 * Math.min(g.h, it.h) && Math.max(g.h0, it.h) / Math.min(g.h0, it.h) < 1.4,
    );
    if (g) {
      g.items.push(it);
      g.h = Math.max(g.h, it.h);
    } else {
      groups.push({ base, h: it.h, h0: it.h, items: [it] });
    }
  }

  const lines: Line[] = groups.map((g) => {
    g.items.sort((a, b) => a.x - b.x);
    const segs: Segment[] = [];
    let cur: Segment | null = null;
    let charW = 0;
    for (const it of g.items) {
      const w = it.w / Math.max(it.str.length, 1) || it.h * 0.5;
      if (cur) {
        const gap = it.x - cur.x1;
        const cw = Math.max(charW, w);
        if (gap <= 1.5 * cw) {
          cur.text += gap > 0.25 * cw ? ' ' + it.str : it.str;
          cur.x1 = Math.max(cur.x1, it.x + it.w);
          charW = w;
          continue;
        }
      }
      cur = { text: it.str, x0: it.x, x1: it.x + it.w };
      segs.push(cur);
      charW = w;
    }
    return { page, y: g.base - g.h, h: g.h, segs, text: joinSegs(segs) };
  });
  lines.sort((a, b) => a.y - b.y || a.segs[0].x0 - b.segs[0].x0);
  return lines;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Build lines from OCR output. Coordinates are divided by `scale` to get PDF points. */
export function linesFromOcr(ocrLines: OcrWord[][], scale: number, page: number): { lines: Line[]; items: TextItem[] } {
  const lines: Line[] = [];
  const items: TextItem[] = [];
  for (const words of ocrLines) {
    const ws = words
      .filter((w) => w.text.trim() && !/^[|—‘’'`";:,.~_-]+$/.test(w.text.trim()))
      .sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (!ws.length) continue;
    const hs = ws.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
    const medH = hs[Math.floor(hs.length / 2)];
    const segs: Segment[] = [];
    let cur: Segment | null = null;
    for (const w of ws) {
      const t = w.text.trim();
      items.push({ str: t, x: w.bbox.x0 / scale, y: w.bbox.y0 / scale, w: (w.bbox.x1 - w.bbox.x0) / scale, h: (w.bbox.y1 - w.bbox.y0) / scale });
      if (cur && w.bbox.x0 - cur.x1 * scale <= 1.1 * medH) {
        cur.text += ' ' + t;
        cur.x1 = w.bbox.x1 / scale;
      } else {
        cur = { text: t, x0: w.bbox.x0 / scale, x1: w.bbox.x1 / scale };
        segs.push(cur);
      }
    }
    const y0 = Math.min(...ws.map((w) => w.bbox.y0));
    const y1 = Math.max(...ws.map((w) => w.bbox.y1));
    lines.push({ page, y: y0 / scale, h: (y1 - y0) / scale, segs, text: joinSegs(segs) });
  }
  lines.sort((a, b) => a.y - b.y || a.segs[0].x0 - b.segs[0].x0);
  return { lines, items };
}
