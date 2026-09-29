import type { DocText, Line, Party, Segment } from '../types';

// ---------- numbers ----------

/** Parses "22,919.05", "$22,919.05", "22.919,05", "222.5", "121K" -> number. */
export function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/-?\d[\d.,]*/);
  if (!m) return undefined;
  let s = m[0].replace(/[.,]$/, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const tail = s.length - lastComma - 1;
    s = tail === 3 || (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g)?.length ?? 0) > 1) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export const MONEY_RE = /^[-(]?[$€£]?\s?\d{1,3}(?:[,.\s]\d{3})*[.,]\d{2}\)?$|^[$€£]?\d+[.,]\d{2}$/;

// ---------- dates ----------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

export type DateOrder = 'MDY' | 'DMY';

const D_MON_Y = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-./]*${MON}[\\s\\-./,]*(\\d{4}|\\d{2})\\b`, 'i');
const MON_D_Y = new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i');
const ISO = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/;
const NUMERIC = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/;

function iso(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Finds the first date in `s` and returns it as YYYY-MM-DD. */
export function parseDate(s: string | undefined, order: DateOrder = 'DMY'): string | undefined {
  return findDate(s, order)?.iso;
}

const month = (s: string) => MONTHS[s.slice(0, 3).toLowerCase()];

/** Numeric day/month order: an impossible month decides it, otherwise the document's convention. */
function numericDate(a: number, b: number, y: number, order: DateOrder) {
  if (a > 12) return iso(y, b, a);
  if (b > 12) return iso(y, a, b);
  return order === 'MDY' ? iso(y, a, b) : iso(y, b, a);
}

const DATE_PATTERNS: [RegExp, (m: RegExpExecArray, order: DateOrder) => string | undefined][] = [
  [D_MON_Y, (m) => iso(+m[3], month(m[2]), +m[1])],
  [MON_D_Y, (m) => iso(+m[3], month(m[1]), +m[2])],
  [ISO, (m) => iso(+m[1], +m[2], +m[3])],
  [NUMERIC, (m, order) => numericDate(+m[1], +m[2], +m[3], order)],
];

/** Earliest date in `s` in any supported format. */
export function findDate(s: string | undefined, order: DateOrder = 'DMY'): { iso: string; index: number; length: number } | undefined {
  if (!s) return undefined;
  const hits: { iso: string; index: number; length: number }[] = [];
  for (const [re, toIso] of DATE_PATTERNS) {
    const m = re.exec(s);
    const v = m ? toIso(m, order) : undefined;
    if (m && v) hits.push({ iso: v, index: m.index, length: m[0].length });
  }
  hits.sort((x, y) => x.index - y.index);
  return hits[0];
}

/** Decides whether a document writes numeric dates as MM/DD or DD/MM. */
export function inferDateOrder(text: string): DateOrder {
  let mdy = 0, dmy = 0;
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](?:\d{4}|\d{2})\b/g)) {
    if (+m[1] > 12 && +m[2] <= 12) dmy++;
    if (+m[2] > 12 && +m[1] <= 12) mdy++;
  }
  if (mdy !== dmy) return mdy > dmy ? 'MDY' : 'DMY';
  return /\bU\.?S\.?A\.?\b|UNITED STATES/i.test(text) ? 'MDY' : 'DMY';
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- text ----------

export const clean = (s: string | undefined) => s?.replace(/\s+/g, ' ').trim() || undefined;

// Case-sensitive on purpose: short suffixes like "SE"/"AG" must not match ordinary (or OCR-garbled) words.
export const COMPANY_RE =
  /\b(LLC|L\.L\.C\.?|Inc\.?|INC\.?|Incorporated|GmbH|GMBH|B\.V\.?|BV|N\.V\.?|NV|Ltd\.?|LTD\.?|Limited|LIMITED|Corp\.?|CORP\.?|Corporation|CORPORATION|S\.A\.?|SA|AG|SE|PLC|Pte|PTE|Co\.|CO\.)(?=$|[\s,.])/;

export const INCOTERM_RE = /\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DAT|DDP|DDU)\b/;

// ---------- positional document view ----------

export interface Hit {
  line: Line;
  lineIdx: number;
  segIdx: number;
  seg: Segment;
  m: RegExpMatchArray;
}

/** Wraps all lines of a document with label/value lookups that understand layout. */
export class DocView {
  readonly lines: Line[];
  readonly text: string;
  readonly order: DateOrder;

  constructor(doc: DocText, lines?: Line[]) {
    this.lines = lines ?? doc.pages.flatMap((p) => p.lines);
    this.text = this.lines.map((l) => l.text).join('\n');
    this.order = inferDateOrder(this.text);
  }

  find(re: RegExp): Hit[] {
    const hits: Hit[] = [];
    this.lines.forEach((line, lineIdx) =>
      line.segs.forEach((seg, segIdx) => {
        const m = seg.text.match(re);
        if (m) hits.push({ line, lineIdx, segIdx, seg, m });
      }),
    );
    return hits;
  }

  /** Candidate values for a label: rest of the segment, next segment on the line, then text just below. */
  candidates(h: Hit): string[] {
    const out: string[] = [];
    const rest = h.seg.text.slice((h.m.index ?? 0) + h.m[0].length).replace(/^[\s:#.\-]+/, '').trim();
    if (rest) out.push(rest);
    const next = h.line.segs[h.segIdx + 1];
    if (next) out.push(next.text);
    for (const l of this.below(h, 2)) {
      const s = l.segs.find((s) => s.x0 < h.seg.x1 + 20 && s.x1 > h.seg.x0 - 5);
      if (s) out.push(s.text);
    }
    return out;
  }

  /** First value for `label` whose text matches `value` (returns capture group 1 when present). */
  value(label: RegExp, value: RegExp = /^(.+)$/): string | undefined {
    return this.values(label, value)[0];
  }

  values(label: RegExp, value: RegExp = /^(.+)$/): string[] {
    const out: string[] = [];
    for (const h of this.find(label)) {
      for (const c of this.candidates(h)) {
        const m = c.match(value);
        if (m) {
          out.push((m[1] ?? m[0]).trim());
          break;
        }
      }
    }
    return out;
  }

  /** Lines directly below a hit on the same page, within `maxLines` line-heights. */
  below(h: Hit, maxLines: number): Line[] {
    const out: Line[] = [];
    const limit = h.line.y + h.line.h * (1.3 * maxLines + 1);
    for (let i = h.lineIdx + 1; i < this.lines.length; i++) {
      const l = this.lines[i];
      if (l.page !== h.line.page || l.y > limit) break;
      if (l.y > h.line.y + h.line.h * 0.4) out.push(l);
    }
    return out;
  }

  /**
   * Text block under a label (e.g. "Ship To:"): the segments below that start
   * near the label's left edge, until a gap or a line matching `stop`.
   */
  block(h: Hit, { maxLines = 6, stop, width = 170 }: { maxLines?: number; stop?: RegExp; width?: number } = {}): string[] {
    const out: string[] = [];
    const rest = h.seg.text.slice((h.m.index ?? 0) + h.m[0].length).replace(/^[\s:#.]+/, '').trim();
    if (rest && !/^\d+$/.test(rest)) out.push(rest);
    let lastY = h.line.y;
    let lastH = h.line.h;
    for (let i = h.lineIdx + 1; i < this.lines.length && out.length < maxLines; i++) {
      const l = this.lines[i];
      if (l.page !== h.line.page) break;
      if (l.y - (lastY + lastH) > Math.max(lastH, l.h) * 1.6) break;
      const s = l.segs.find((s) => s.x0 >= h.seg.x0 - 12 && s.x0 <= h.seg.x0 + width * 0.35 && s.x0 < h.seg.x0 + width);
      if (!s) continue;
      if (stop?.test(s.text)) break;
      out.push(s.text.trim());
      lastY = l.y;
      lastH = l.h;
    }
    return out;
  }
}

export function toParty(lines: string[]): Party {
  const ls = lines.map((l) => l.trim()).filter(Boolean);
  return { name: ls[0], address: ls.slice(1) };
}
