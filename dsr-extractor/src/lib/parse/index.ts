import type { DocText, DocType, ExtractedDoc } from '../types';
import { parseAwb } from './awb';
import { parseBl } from './bl';
import { parseInvoice } from './invoice';

export function classify(text: string, fileName: string): DocType {
  const t = text.toLowerCase();
  const f = fileName.toLowerCase();
  const score: Record<Exclude<DocType, 'unknown'>, number> = { awb: 0, invoice: 0, bl: 0, packing: 0 };
  if (/air\s*way\s*bill/.test(t)) score.awb += 3;
  if (/\b(h|m)?awb\b/.test(t)) score.awb += 2;
  if (/airport\s+of\s+(departure|destination)|chargeable\s+weight|issuing\s+carrier/.test(t)) score.awb += 2;
  if (/commercial\s+invoice|tax\s+invoice|pro\s*-?\s*forma/.test(t)) score.invoice += 3;
  if (/invoice\s*(no|number|#|date)/.test(t)) score.invoice += 2;
  if (/total\s*(due|amount|value)|unit\s*price/.test(t)) score.invoice += 1;
  if (/bill\s+of\s+lading|sea\s*way\s*bill|\bb\s*\/\s*l\b/.test(t)) score.bl += 3;
  if (/port\s+of\s+(loading|discharge)|\bvessel\b|\bvoyage\b/.test(t)) score.bl += 2;
  if (/packing\s*list/.test(t)) score.packing += 3;
  if (/air\s*way\s*bill|\bh?awb\b|\bmawb\b/.test(f)) score.awb += 3;
  if (/invoice/.test(f)) score.invoice += 3;
  if (/\bb\/?l\b|lading/.test(f)) score.bl += 3;
  if (/packing/.test(f)) score.packing += 3;
  const [type, s] = Object.entries(score).sort((a, b) => b[1] - a[1])[0] as [DocType, number];
  return s >= 2 ? type : 'unknown';
}

/** Leading shipment/job reference in names like "2620619335_4030515970_House Airway Bill.pdf". */
export function filePrefix(fileName: string): string | undefined {
  const p = fileName.split(/[_\s]/)[0];
  return /^(?=.*\d)[A-Z0-9-]{6,}$/i.test(p) ? p.toUpperCase() : undefined;
}

export function parseDocument(id: string, fileName: string, text: DocText): ExtractedDoc {
  const rawText = text.pages.map((p, i) => `--- Page ${i + 1} (${p.method === 'ocr' ? 'OCR' : 'text'}) ---\n` + p.lines.map((l) => l.text).join('\n')).join('\n\n');
  const methods = new Set(text.pages.map((p) => p.method));
  const confs = text.pages.filter((p) => p.confidence !== undefined).map((p) => p.confidence!);
  const doc: ExtractedDoc = {
    id,
    fileName,
    type: classify(rawText, fileName),
    pageCount: text.pages.length,
    method: methods.size > 1 ? 'mixed' : methods.has('ocr') ? 'ocr' : 'text',
    ocrConfidence: confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : undefined,
    keys: [],
    rawText,
    warnings: [],
  };
  const keys = new Set<string>();
  const prefix = filePrefix(fileName);
  if (prefix) keys.add('file:' + prefix);

  if (!text.pages.some((p) => p.lines.length)) doc.warnings.push('No text could be read from this file.');
  if (doc.ocrConfidence !== undefined && doc.ocrConfidence < 60) doc.warnings.push(`Low OCR confidence (${doc.ocrConfidence}%). Please check values.`);

  switch (doc.type) {
    case 'awb': {
      const a = (doc.awb = parseAwb(text));
      for (const k of [a.hawb, a.mawb, ...a.references]) if (k) keys.add('id:' + k.toUpperCase());
      if (!a.hawb && !a.mawb) doc.warnings.push('AWB number not found.');
      break;
    }
    case 'invoice':
    case 'packing': {
      const inv = (doc.invoice = parseInvoice(text));
      if (inv.invoiceNo) keys.add('id:' + inv.invoiceNo.toUpperCase());
      if (doc.type === 'invoice' && !inv.invoiceNo) doc.warnings.push('Invoice number not found.');
      if (doc.type === 'invoice' && inv.amount === undefined) doc.warnings.push('Invoice amount not found.');
      break;
    }
    case 'bl': {
      const bl = (doc.bl = parseBl(text));
      if (bl.blNo) keys.add('id:' + bl.blNo.toUpperCase());
      if (!bl.blNo) doc.warnings.push('B/L number not found.');
      break;
    }
    default:
      doc.warnings.push('Document type not recognised. Supported: Air Waybill, Commercial Invoice, Bill of Lading, Packing List.');
  }
  doc.keys = [...keys];
  return doc;
}
