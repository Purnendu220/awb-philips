import type { DocText, InvoiceData, Line, LineItem } from '../types';
import { clean, COMPANY_RE, DocView, INCOTERM_RE, MONEY_RE, parseDate, parseNumber, toParty, type Hit } from './util';

const ID = /^([A-Z0-9][A-Z0-9\-/]{3,})\b/i;
const DATE_VAL = /^(.*\d.*)$/;

/** Commercial invoice parser: label/value lookups that tolerate OCR noise and varied layouts. */
export function parseInvoice(doc: DocText): InvoiceData {
  const v = new DocView(doc);
  const out: InvoiceData = { exporter: {}, billTo: {}, shipTo: {}, items: [], packages: [] };

  out.invoiceNo = best(v.values(/invoice\s*(?:no|number|num|#)\.?\s*:?/i, ID));
  out.invoiceDate = firstDate(v, /invoice\s*date\s*:?/i) ?? firstDate(v, /^date\s*:?/i);
  out.orderNo = best(v.values(/\b(?:sales\s*)?order\s*(?:no|number|#)\.?\s*:?/i, /^(?=[A-Z0-9-]*\d)([A-Z0-9-]{4,})$/i));
  out.orderDate = firstDate(v, /order\s*date\s*:?/i);
  out.customerPo = best(
    v.values(/(?:customer\s*)?(?:p\.?\s*o\.?|purchase\s*order)\s*(?:no|number|#)?\.?\s*:?$/i, /^(?=[A-Z0-9-]*\d)([A-Z0-9-]{4,})/i),
  );
  out.shipDate = firstDate(v, /ship(?:ment|ping)?\s*date\s*:?/i);
  out.shipVia = clean(v.value(/ship\s*via\s*:?/i));
  out.shippingTerms = clean(
    v.value(/(?:shipping|delivery|payment\s+and\s+delivery)\s*terms\s*:?|inco\s*terms?\s*:?|terms\s+of\s+delivery\s*:?/i),
  );
  out.incoterm = (out.shippingTerms ?? v.text).match(INCOTERM_RE)?.[1];

  // Currency: explicit label, else an ISO code next to an amount, else a symbol.
  out.currency =
    v.value(/^currency\s*:?/i, /^([A-Z]{3})\b/) ??
    v.text.match(/\b(USD|EUR|GBP|JPY|CNY|CHF|SGD|INR|AUD|CAD|HKD)\b/)?.[1] ??
    (/\$/.test(v.text) ? 'USD' : /€/.test(v.text) ? 'EUR' : /£/.test(v.text) ? 'GBP' : undefined);

  // Parties
  const exporter = v.find(/^(exporter|shipper|seller|sold\s+by|consignor|supplier)\b\s*:?/i)[0];
  if (exporter) out.exporter = toParty(v.block(exporter, { maxLines: 4, stop: /bill\s*to|ship\s*to|invoice/i }));
  if (!out.exporter.name || !COMPANY_RE.test(out.exporter.name)) {
    const guess = guessCompany(v);
    if (guess) out.exporter = { name: guess, address: [] };
  }
  const billTo = v.find(/^(bill\s*to|sold\s*to|buyer|invoice\s*to)\b[^:]*:?/i)[0];
  if (billTo) out.billTo = toParty(stripAccount(v.block(billTo, { maxLines: 6, stop: /ship\s*to|invoice\s*(no|date)/i })));
  const shipTo = v.find(/^(ship\s*to|deliver\s*to|consignee)\b[^:]*:?/i)[0];
  if (shipTo) out.shipTo = toParty(stripAccount(v.block(shipTo, { maxLines: 6, stop: /invoice\s*(no|date)|order\s*no|terms/i })));

  const endUser = v.find(/end\s*user\s*:?/i)[0];
  if (endUser) out.endUser = endUserName(v, endUser);

  const origin = v.lines.flatMap((l) => l.segs).map((s) => s.text.match(/^made\s+in\s+([A-Z][A-Za-z .]{1,30})$/i)?.[1]).find(Boolean);
  out.countryOfOrigin = clean(origin ?? v.value(/country\s+of\s+origin\s*:?$/i, /^([A-Z][A-Za-z ]{1,30})$/));

  // Packages written as "58 GROSS KG/ 41 NET KG / 32X29X35 IN"
  for (const m of v.text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:KGS?\s*)?GROSS\s*(?:KGS?)?\s*\/?\s*(?:(\d+(?:[.,]\d+)?)\s*(?:KGS?\s*)?NET\s*(?:KGS?)?)?\s*(?:\/\s*([\d.]+\s*[X*]\s*[\d.]+\s*[X*]\s*[\d.]+\s*(?:IN|CM|MM)?))?/gi)) {
    out.packages.push({ gross: parseNumber(m[1]), net: parseNumber(m[2]), dims: clean(m[3]) });
  }
  if (out.packages.length) {
    out.grossWeight = round(out.packages.reduce((s, p) => s + (p.gross ?? 0), 0));
    const net = out.packages.reduce((s, p) => s + (p.net ?? 0), 0);
    if (net) out.netWeight = round(net);
  } else {
    out.grossWeight = parseNumber(v.value(/gross\s*(?:weight|wt)\.?\s*(?:\(kgs?\))?\s*:?/i, /^(\d[\d.,]*)/));
    out.netWeight = parseNumber(v.value(/net\s*(?:weight|wt)\.?\s*(?:\(kgs?\))?\s*:?/i, /^(\d[\d.,]*)/));
  }

  out.items = parseItems(v);
  out.amount = pickAmount(v, out.items);
  return out;
}

function firstDate(v: DocView, label: RegExp): string | undefined {
  for (const s of v.values(label, DATE_VAL)) {
    const d = parseDate(s, v.order);
    if (d) return d;
  }
  return undefined;
}

/** The most plausible ID among OCR candidates: digit-rich values that repeat win. */
function best(cands: string[]): string | undefined {
  const score = (c: string) => {
    const digits = (c.match(/\d/g) ?? []).length;
    const letters = (c.match(/[A-Z]/gi) ?? []).length;
    return digits * 2 - (letters > digits ? letters : 0) + cands.filter((x) => x === c).length * 3;
  };
  return cands.filter((c) => /\d/.test(c)).sort((a, b) => score(b) - score(a))[0];
}

function stripAccount(lines: string[]): string[] {
  return lines.map((l) => l.replace(/^A\/C\s*:?\s*/i, '')).filter((l) => !/^\d+$/.test(l));
}

function endUserName(v: DocView, h: Hit): string | undefined {
  const lines = v.block(h, { maxLines: 3 });
  const name: string[] = [];
  for (const l of lines) {
    if (/^\d/.test(l) || /,/.test(l) && name.length) break;
    name.push(l);
    if (name.length === 2) break;
  }
  // Drop trailing system codes like "IBSIMCL.WAR".
  return clean(name.join(' ').replace(/\s+[A-Z0-9]+\.[A-Z0-9]+$/, ''));
}

function guessCompany(v: DocView): string | undefined {
  const first = v.lines.filter((l) => l.page === 0);
  const top = first.slice(0, Math.ceil(first.length * 0.3));
  for (const l of top)
    for (const s of l.segs)
      if (COMPANY_RE.test(s.text) && !/india|bank|account/i.test(s.text) && s.text.length < 60) return clean(s.text);
  return undefined;
}

const HEADER_WORDS: [keyof LineItem | 'desc', RegExp][] = [
  ['partNo', /part\s*(no|number|#)|item\s*(no|code)|material|article/i],
  ['desc', /description/i],
  ['qty', /^(qty|quantity|ship)\b/i],
  ['unitPrice', /unit\s*price|^price|rate/i],
  ['total', /^(total|amount|ext(ended)?\.?\s*(price|amount)|line\s*total|value)\b/i],
  ['serialNo', /serial/i],
  ['hsCode', /schedule\s*b|hs\s*code|hsn|tariff|commodity\s*code/i],
];

function parseItems(v: DocView): LineItem[] {
  const items: LineItem[] = [];
  const seenHeaders = new Set<string>();
  for (let i = 0; i < v.lines.length; i++) {
    const hdr = v.lines[i];
    const cols = new Map<string, number>();
    for (const s of hdr.segs)
      for (const [k, re] of HEADER_WORDS) if (re.test(s.text) && !cols.has(k)) cols.set(k, s.x0);
    if (cols.size < 3 || !cols.has('total') && !cols.has('qty')) continue;
    const sig = [...cols.keys()].join();
    if (seenHeaders.has(sig + hdr.page)) continue;
    seenHeaders.add(sig + hdr.page);

    let cur: LineItem | null = null;
    for (let j = i + 1; j < v.lines.length; j++) {
      const l = v.lines[j];
      if (l.page !== hdr.page || /total\s*due|grand\s*total|sub\s*-?\s*total|^total\b|^page\s+\d/i.test(l.text)) break;
      const last = l.segs[l.segs.length - 1];
      if (MONEY_RE.test(last.text.trim()) && l.segs.length >= 2) {
        cur = rowToItem(l, cols);
        items.push(cur);
      } else if (cur && !cur.description) {
        const d = l.segs
          .map((s) => s.text)
          .filter((t) => /[A-Za-z]{3}/.test(t) && !/^(made\s+in|country\s+of\s+origin|description)$/i.test(t.trim()));
        if (d.length) cur.description = clean(d.join(' '));
      }
    }
  }
  return items;
}

function rowToItem(l: Line, cols: Map<string, number>): LineItem {
  const it: LineItem = {};
  const segs = [...l.segs];
  const total = segs.pop()!;
  it.total = parseNumber(total.text);
  const near = (key: string, tol = 30) => {
    const x = cols.get(key);
    if (x === undefined) return undefined;
    const idx = segs.findIndex((s) => Math.abs(s.x0 - x) <= tol || (s.x0 <= x && s.x1 >= x));
    return idx >= 0 ? segs.splice(idx, 1)[0].text.trim() : undefined;
  };
  const hs = segs.findIndex((s) => /^\d{4}\.\d{2}(\.\d{2,4})?$|^\d{8,10}$/.test(s.text.trim()));
  if (hs >= 0) it.hsCode = segs.splice(hs, 1)[0].text.trim();
  it.partNo = near('partNo');
  it.serialNo = near('serialNo');
  const qty = near('qty', 25);
  it.qty = parseNumber(qty);
  const up = near('unitPrice');
  if (up) it.unitPrice = parseNumber(up);
  const desc = segs.map((s) => s.text).filter((t) => /[A-Za-z]{3}/.test(t));
  if (desc.length) it.description = clean(desc.join(' '));
  return it;
}

function pickAmount(v: DocView, items: LineItem[]): number | undefined {
  const lineSum = round(items.reduce((s, i) => s + (i.total ?? 0), 0));
  const cands: { n: number; p: number }[] = [];
  const add = (re: RegExp, p: number) => {
    for (const s of v.values(re, /^[$€£]?\s*([\d.,]+\d)/)) {
      const n = parseNumber(s);
      if (n) cands.push({ n, p });
    }
  };
  add(/total\s*due\s*:?/i, 5);
  add(/grand\s*total\s*:?|total\s*invoice\s*(?:value|amount)\s*:?|invoice\s*total\s*:?/i, 4);
  add(/invoice\s*(?:amount|value)\s*:?/i, 4);
  add(/total\s*(?:amount|value)\s*:?/i, 3);
  if (lineSum) {
    const match = cands.find((c) => Math.abs(c.n - lineSum) < 0.01);
    if (match) return match.n;
  }
  cands.sort((a, b) => b.p - a.p);
  return cands[0]?.n ?? (lineSum || undefined);
}

const round = (n: number) => Math.round(n * 1000) / 1000;
