import type { AwbData, DocText, Line, PageText, Segment } from '../types';
import { clean, DocView, findDate, INCOTERM_RE, parseNumber, toParty } from './util';

/**
 * Air Waybill parser.
 *
 * Every AWB (house or master) follows the IATA layout, so instead of fixed
 * coordinates we locate the pre-printed box labels ("Shipper's Name and
 * Address", "Airport of Destination", ...) and read the filled-in text that
 * sits inside each box. Falls back to plain regexes when labels are missing
 * (e.g. a badly scanned AWB).
 */

interface Box {
  x0: number;
  x1: number;
  y: number;
  h: number;
}

const LABELS = {
  shipper: /shipper'?s\s+name\s+and\s+address/i,
  shipperAcct: /shipper'?s\s+account/i,
  notNegotiable: /not\s+negotiable/i,
  consignee: /consignee'?s\s+name\s+and\s+address/i,
  agent: /issuing\s+carrier'?s\s+agent/i,
  iata: /agent'?s\s+iata\s+code/i,
  accountNo: /^account\s+no/i,
  departure: /airport\s+of\s+departure/i,
  firstCarrier: /by\s+first\s+carrier/i,
  currency: /^currency$/i,
  destination: /airport\s+of\s+destination/i,
  flight: /requested\s+flight/i,
  insurance: /amount\s+of\s+insurance/i,
  handling: /handling\s+information/i,
  pieces: /^(no\.?\s+of|pieces)$/i,
  gross: /^gross$/i,
  chargeable: /^chargeable$/i,
  itemNo: /^item\s+no/i,
  nature: /nature\s+and\s+quantity/i,
  prepaid: /^prepaid$/i,
  weightCharge: /weight\s+charge/i,
  executed: /executed\s+on/i,
};
type LabelKey = keyof typeof LABELS;

const mid = (b: Box) => b.y + b.h / 2;
const base = (l: Line) => l.y + l.h;

export function parseAwb(doc: DocText): AwbData {
  const page = doc.pages[0];
  const out: AwbData = {
    shipper: {},
    consignee: {},
    agent: {},
    routing: [],
    flights: [],
    references: [],
    goodsDetails: [],
  };

  const labels: Partial<Record<LabelKey, Box>> = {};
  for (const l of page.lines)
    for (const s of l.segs)
      for (const [k, re] of Object.entries(LABELS) as [LabelKey, RegExp][])
        if (!labels[k] && re.test(s.text)) labels[k] = { x0: s.x0, x1: s.x1, y: l.y, h: l.h };

  const data = dataLines(page, labels);
  const L = labels;
  const midX = L.notNegotiable
    ? L.shipperAcct
      ? (L.shipperAcct.x1 + L.notNegotiable.x0) / 2
      : L.notNegotiable.x0 - 15
    : page.width / 2;

  /** Data lines whose baseline lies between two labels, restricted to an x range. */
  const zone = (top: Box | undefined, bottom: Box | undefined, x0 = -Infinity, x1 = Infinity): Segment[][] => {
    if (!top) return [];
    const yMax = bottom ? mid(bottom) : top.y + 80;
    return data
      .filter((l) => base(l) > mid(top) && base(l) <= yMax)
      .map((l) => l.segs.filter((s) => s.x0 >= x0 && s.x0 < x1))
      .filter((segs) => segs.length);
  };
  const zoneText = (...a: Parameters<typeof zone>) => zone(...a).map((segs) => segs.map((s) => s.text).join(' '));

  // Parties
  out.shipper = toParty(zoneText(L.shipper, L.consignee, -Infinity, midX));
  out.consignee = toParty(zoneText(L.consignee, L.agent, -Infinity, midX));
  out.agent = toParty(zoneText(L.agent, L.iata, -Infinity, midX));
  out.agentIata = clean(zoneText(L.iata, L.departure, -Infinity, L.accountNo ? L.accountNo.x0 - 5 : midX)[0]);

  // Airports
  // City boxes hold one value; take the first segment so neighbouring boxes don't bleed in.
  const dep = zone(L.departure, L.firstCarrier, -Infinity, midX)[0]?.[0]?.text;
  out.departure = dep ? cityOf(dep) : undefined;
  const dest = zone(L.destination, L.handling, -Infinity, L.flight ? L.flight.x0 - 8 : midX)[0]?.[0]?.text;
  out.destination = dest ? cityOf(dest) : undefined;

  // Routing row: "LHR BA   DEL BA   USD ..."
  const routeSegs = zone(L.firstCarrier, L.destination).flat();
  const curX = L.currency?.x0;
  const routeTokens = routeSegs
    .filter((s) => curX === undefined || s.x0 < curX - 8)
    .flatMap((s) => s.text.split(/\s+/));
  for (let i = 0; i < routeTokens.length; i++) {
    const t = routeTokens[i];
    if (/^[A-Z]{3}$/.test(t)) {
      const by = routeTokens[i + 1];
      out.routing.push({ to: t, by: by && /^[A-Z0-9]{2}$/.test(by) ? by : undefined });
    }
  }
  if (curX !== undefined) {
    const cur = routeSegs.find((s) => Math.abs(s.x0 - curX) < 25 && /^[A-Z]{3}$/.test(s.text));
    out.currency = cur?.text;
  }

  // Requested flights "BA0048/18 BA0257/19"
  const flightText = zone(L.flight, L.handling, L.flight ? L.flight.x0 - 40 : midX)
    .flat()
    .map((s) => s.text)
    .join(' ');
  for (const m of flightText.matchAll(/([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4}[A-Z]?)\s*\/\s*(\d{1,2})/g)) {
    out.flights.push({ flight: m[1] + m[2], day: +m[3] });
  }

  // Handling information + references
  const header = L.pieces ?? L.gross ?? L.nature;
  const handling = zoneText(L.handling, header);
  out.handling = clean(handling.join(' '));
  if (out.handling) {
    out.references = [...new Set(out.handling.match(/\b\d{6,}\b/g) ?? [])];
  }

  // Goods table
  const headerBottom = [L.pieces, L.gross, L.chargeable, L.itemNo, L.nature]
    .filter((b): b is Box => !!b)
    .reduce<Box | undefined>((a, b) => (!a || b.y > a.y ? b : a), undefined);
  const goodsBottom = L.prepaid ?? L.weightCharge;
  const goods = zone(headerBottom, goodsBottom);
  const natureX = L.nature ? L.nature.x0 - 50 : midX + 80;
  const rowLines = goods.map((segs) => segs.filter((s) => s.x0 < natureX)).filter((s) => s.length);
  const natureLines = goods
    .map((segs) =>
      segs
        .filter((s) => s.x0 >= natureX)
        .map((s) => s.text)
        .join(' '),
    )
    .filter((t) => t && !/^page\s+\d/i.test(t));
  out.goods = clean(natureLines[0]);
  out.goodsDetails = natureLines.slice(1).map((t) => t.trim());

  const first = rowLines.find((segs) => /^\d+$/.test(segs[0].text.split(/\s+/)[0]));
  if (first) {
    const tokens = tokenize(first);
    const nearest = (box: Box | undefined, pred: (t: string) => boolean) => {
      if (!box) return undefined;
      const c = (box.x0 + box.x1) / 2;
      return tokens.filter((t) => pred(t.text)).sort((a, b) => Math.abs(a.x - c) - Math.abs(b.x - c))[0];
    };
    const isNum = (t: string) => /^\d[\d,]*(\.\d+)?[KL]?$/i.test(t);
    const pcs = nearest(L.pieces, (t) => /^\d+$/.test(t)) ?? tokens[0];
    out.pieces = parseNumber(pcs.text);
    const gross = nearest(L.gross, isNum) ?? tokens[1];
    if (gross && gross !== pcs) {
      out.grossWeight = parseNumber(gross.text);
      const unit = gross.text.match(/([KL])$/i)?.[1] ?? tokens[tokens.indexOf(gross) + 1]?.text.match(/^(K|KG|L|LB)$/i)?.[1];
      if (unit) out.weightUnit = /^K/i.test(unit) ? 'KG' : 'LB';
    }
    const ch = nearest(L.chargeable, isNum);
    if (ch && ch !== gross && ch !== pcs) out.chargeableWeight = parseNumber(ch.text);
  }
  const dims = [...rowLines.flat(), ...goods.flat()].map((s) => s.text).find((t) => /DIM/i.test(t));
  if (dims) out.dimensions = clean(dims.replace(/^DIMS?\s*(\([A-Z]+\))?:?\s*/i, ''));

  // Execution date / place (text just above "Executed on (date)")
  if (L.executed) {
    const ex = data
      .filter((l) => base(l) <= L.executed!.y + L.executed!.h && base(l) > L.executed!.y - 40)
      .flatMap((l) => l.segs.filter((s) => s.x1 > L.executed!.x0 - 20))
      .map((s) => s.text);
    for (const t of ex.reverse()) {
      const d = findDate(t, 'DMY');
      if (d) {
        out.executedDate = d.iso;
        out.executedPlace = clean(t.slice(d.index + d.length).replace(/^[\s,]+/, ''));
        break;
      }
    }
  }

  applyTextFallbacks(new DocView(doc), out);
  return out;
}

/** Filled-in data lines: excludes pre-printed labels/terms (smaller font) and watermarks. */
function dataLines(page: PageText, labels: Partial<Record<LabelKey, Box>>): Line[] {
  const labelHs = Object.values(labels).map((b) => b!.h).sort((a, b) => a - b);
  if (!labelHs.length || page.method === 'ocr') return page.lines;
  const labelH = labelHs[Math.floor(labelHs.length / 2)];
  const bigger = page.lines.filter((l) => l.h > labelH * 1.3);
  if (!bigger.length) return page.lines;
  const counts = new Map<number, number>();
  for (const l of bigger) counts.set(Math.round(l.h), (counts.get(Math.round(l.h)) ?? 0) + l.segs.length);
  const dataH = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return bigger.filter((l) => l.h >= dataH * 0.75 && l.h <= dataH * 1.35);
}

function tokenize(segs: Segment[]): { text: string; x: number }[] {
  const out: { text: string; x: number }[] = [];
  for (const s of segs) {
    const cw = (s.x1 - s.x0) / Math.max(s.text.length, 1);
    for (const m of s.text.matchAll(/\S+/g)) out.push({ text: m[0], x: s.x0 + (m.index! + m[0].length / 2) * cw });
  }
  return out;
}

const AIRPORTS: Record<string, string> = {
  DEL: 'DELHI', BOM: 'MUMBAI', MAA: 'CHENNAI', BLR: 'BANGALORE', CCU: 'KOLKATA', HYD: 'HYDERABAD',
  AMD: 'AHMEDABAD', COK: 'COCHIN', PNQ: 'PUNE', SEA: 'SEATTLE', AMS: 'AMSTERDAM', FRA: 'FRANKFURT',
  STR: 'STUTTGART', HKG: 'HONG KONG', SZX: 'SHENZHEN', PVG: 'SHANGHAI', LAX: 'LOS ANGELES',
  PIT: 'PITTSBURGH', BRU: 'BRUSSELS', JFK: 'NEW YORK', SFO: 'SAN FRANCISCO', EIN: 'EINDHOVEN',
  LHR: 'LONDON', CDG: 'PARIS', ORD: 'CHICAGO', ATL: 'ATLANTA', BOS: 'BOSTON', SIN: 'SINGAPORE', DXB: 'DUBAI',
};

/** "SEATTLE, WA" -> "SEATTLE"; "DEL" -> "DELHI". */
export function cityOf(s: string): string {
  const t = s.trim().toUpperCase();
  if (AIRPORTS[t]) return AIRPORTS[t];
  const m = t.match(/^\(?([A-Z]{3})\)?\s*[-–]\s*(.+)$/);
  if (m && AIRPORTS[m[1]]) return AIRPORTS[m[1]];
  return t.split(',')[0].replace(/\s*\([A-Z]{3}\)$/, '').trim();
}

function applyTextFallbacks(v: DocView, out: AwbData) {
  const hawb = v.text.match(/\bHAWB\s*(?:NO\.?|NUMBER|#)?\s*:?\s*([A-Z0-9]{6,})/i);
  if (hawb) out.hawb = hawb[1];
  const mawb = v.text.match(/\bMAWB\s*(?:NO\.?|NUMBER|#)?\s*:?\s*(\d{3}[-\s]?\d{4}\s?\d{4})/i);
  if (mawb) out.mawb = mawb[1].replace(/\s/g, '');
  if (!out.hawb && !out.mawb) {
    const top = v.lines.slice(0, 6).map((l) => l.text).join('\n');
    const m =
      top.match(/\b(\d{3}[-\s]\d{4}\s?\d{4})\b/) ??
      v.text.match(/(?:AIR\s*WAYBILL|AWB)\s*(?:NO\.?|NUMBER|#)\s*:?\s*([A-Z0-9-]{8,})/i) ??
      top.match(/^\s*[A-Z]{3}\s+(\d{8,12})\s*$/m);
    if (m) out.hawb = m[1].replace(/\s/g, '');
  }
  if (out.pieces === undefined) {
    const m = v.text.match(/^\s*(\d{1,4})\s+(\d[\d,]*(?:\.\d+)?)\s*(K|KG|L|LB)\b/im);
    if (m) {
      out.pieces = +m[1];
      out.grossWeight ??= parseNumber(m[2]);
      out.weightUnit ??= /^K/i.test(m[3]) ? 'KG' : 'LB';
    }
  }
  if (!out.executedDate) {
    const ex = v.find(/executed\s+on/i)[0];
    const near = ex ? [...v.below(ex, 2), ex.line] : [];
    for (const l of [...near, ...v.lines.slice().reverse()]) {
      const d = findDate(l.text, v.order);
      if (d) {
        out.executedDate = d.iso;
        break;
      }
    }
  }
  if (!out.departure) {
    const d = v.value(/airport\s+of\s+departure/i, /^([A-Z][A-Za-z .,]{2,})$/);
    if (d) out.departure = cityOf(d);
  }
  if (!out.destination) {
    const d = v.value(/airport\s+of\s+destination/i, /^([A-Z][A-Za-z .,]{2,})$/);
    if (d) out.destination = cityOf(d);
  }
  if (!out.destination && out.routing.length) out.destination = cityOf(out.routing[out.routing.length - 1].to);
  if (!out.shipper.name) out.shipper = toParty(v.find(LABELS.shipper).flatMap((h) => v.block(h, { maxLines: 4 })));
  if (!out.consignee.name) out.consignee = toParty(v.find(LABELS.consignee).flatMap((h) => v.block(h, { maxLines: 5 })));
  out.incoterm = out.handling?.match(INCOTERM_RE)?.[1];
}
