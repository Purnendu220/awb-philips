import type { BlData, DocText } from '../types';
import { cityOf } from './awb';
import { clean, DocView, parseDate, parseNumber, toParty } from './util';

const CARRIERS = ['MAERSK', 'CMA CGM', 'CMA', 'MSC', 'HAPAG', 'COSCO', 'EVERGREEN', 'ONE', 'OOCL', 'YANG MING', 'HMM', 'ZIM', 'DSV', 'EXPEDITORS', 'KUEHNE', 'DHL', 'SCHENKER'];

/** Bill of Lading / Sea Waybill parser (label driven; layouts vary a lot between lines). */
export function parseBl(doc: DocText): BlData {
  const v = new DocView(doc);
  const out: BlData = { shipper: {}, consignee: {}, containers: [] };

  out.blNo =
    v.value(/(?:b\s*\/\s*l|bill\s+of\s+lading|bol|sea\s*waybill|waybill)\s*(?:no|number|#)\.?\s*:?/i, /^([A-Z0-9-]{6,})/i) ??
    v.text.match(/\b(?:B\/L|BL)\s*(?:NO\.?|#)?\s*:?\s*([A-Z]{4}\d{6,}|[A-Z0-9]{8,})\b/)?.[1];
  const dateStr = v.value(/(?:shipped\s+on\s+board|on\s*board)\s*(?:date)?\s*:?|date\s+of\s+issue\s*:?|(?:b\/l|issue)\s+date\s*:?|place\s+and\s+date\s+of\s+issue/i, /^(.*\d.*)$/);
  out.blDate = parseDate(dateStr, v.order);

  const shipper = v.find(/^(shipper|consignor|exporter)\b/i)[0];
  if (shipper) out.shipper = toParty(v.block(shipper, { maxLines: 5, stop: /consignee|notify/i, width: 260 }));
  const consignee = v.find(/^consignee\b/i)[0];
  if (consignee) out.consignee = toParty(v.block(consignee, { maxLines: 5, stop: /notify|shipper/i, width: 260 }));

  out.vessel = clean(v.value(/(?:ocean\s+)?vessel(?:\s*\/\s*voy(?:age)?)?\s*(?:name)?\s*:?/i));
  const pol = v.value(/port\s+of\s+loading\s*:?/i, /^([A-Z][A-Za-z ,.()-]{2,})$/);
  if (pol) out.portOfLoading = cityOf(pol);
  const pod = v.value(/port\s+of\s+discharge\s*:?|place\s+of\s+delivery\s*:?/i, /^([A-Z][A-Za-z ,.()-]{2,})$/);
  if (pod) out.portOfDischarge = cityOf(pod);

  const upper = v.text.toUpperCase();
  out.carrier = CARRIERS.find((c) => new RegExp(`\\b${c}\\b`).test(upper));

  const seen = new Set<string>();
  for (const m of upper.matchAll(/\b([A-Z]{4}\s?\d{7})\b/g)) {
    const no = m[1].replace(/\s/g, '');
    if (seen.has(no)) continue;
    seen.add(no);
    const around = upper.slice(m.index, m.index + 80);
    const size = around.match(/\b(20|40)\s*'?\s*(?:FT|GP|DV|HC|HQ|STD|DC|RF|OT|FR)?\b/)?.[1] as '20' | '40' | undefined;
    out.containers.push({ no, size });
  }
  out.lcl = /\bLCL\b/.test(upper) || undefined;

  out.packages = parseNumber(upper.match(/\b(\d{1,5})\s*(?:PKGS?|PACKAGES?|CTNS?|CARTONS?|PALLETS?|PLTS?|CASES?|CRATES?)\b/)?.[1]);
  out.grossWeight = parseNumber(v.value(/gross\s*(?:weight|wt)\.?\s*(?:\(kgs?\))?\s*:?/i, /^(\d[\d.,]*)/));
  out.goods = clean(v.value(/description\s+of\s+(?:goods|packages)/i));
  return out;
}
