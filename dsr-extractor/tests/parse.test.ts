import { afterAll, describe, expect, it } from 'vitest';
import { parseDocument } from '../src/lib/parse';
import { COMPANY_RE, findDate, inferDateOrder, parseNumber } from '../src/lib/parse/util';
import { closeOcr, loadDocText } from './helpers';

const AWB = '2620619335_4030515970_House Airway Bill.pdf';
const INV = '2620619335_F032083892_Commercial Invoice.pdf';

afterAll(closeOcr);

describe('utils', () => {
  it('parses numbers in common formats', () => {
    expect(parseNumber('$22,919.05')).toBe(22919.05);
    expect(parseNumber('22.919,05')).toBe(22919.05);
    expect(parseNumber('121K')).toBe(121);
    expect(parseNumber('222.5')).toBe(222.5);
    expect(parseNumber('1,234')).toBe(1234);
  });
  it('parses dates', () => {
    expect(findDate('17 March 2026 SEATTLE')?.iso).toBe('2026-03-17');
    expect(findDate('03/13/26', 'MDY')?.iso).toBe('2026-03-13');
    expect(findDate('13.03.2026')?.iso).toBe('2026-03-13');
    expect(findDate('17MAR26')?.iso).toBe('2026-03-17');
    expect(findDate('March 17, 2026')?.iso).toBe('2026-03-17');
    expect(inferDateOrder('Order Date: 12/31/25')).toBe('MDY');
    expect(inferDateOrder('Date: 31/12/25')).toBe('DMY');
  });
  it('recognises company names but not OCR noise', () => {
    expect(COMPANY_RE.test('Philips Ultrasound LLC')).toBe(true);
    expect(COMPANY_RE.test('PHILIPS MEDIZIN SYSTEME GMBH')).toBe(true);
    expect(COMPANY_RE.test('Barco NV')).toBe(true);
    expect(COMPANY_RE.test('re Se aumnmengh,')).toBe(false);
    expect(COMPANY_RE.test('Bill Terme Co 1438332')).toBe(false);
  });
});

describe('House Air Waybill (text PDF)', async () => {
  const doc = parseDocument('a', AWB, await loadDocText(AWB));
  const a = doc.awb!;
  it('is classified and read from the text layer', () => {
    expect(doc.type).toBe('awb');
    expect(doc.method).toBe('text');
  });
  it('extracts header fields', () => {
    expect(a.hawb).toBe('4030515970');
    expect(a.shipper.name).toBe('Philips Ultrasound LLC');
    expect(a.shipper.address).toEqual(['22100 Bothell-Everett Highway', 'Bothell WA 98021', 'U.S.A.']);
    expect(a.consignee.name).toBe('Philips India Limited Healthcare');
    expect(a.consignee.address?.join(' ')).toContain('Pataudi Road');
    expect(a.agent.name).toBe('Expeditors International of Washing');
    expect(a.agentIata).toBe('01-1-1853/0243');
  });
  it('extracts routing', () => {
    expect(a.departure).toBe('SEATTLE');
    expect(a.destination).toBe('DELHI');
    expect(a.routing).toEqual([{ to: 'LHR', by: 'BA' }, { to: 'DEL', by: 'BA' }]);
    expect(a.flights).toEqual([{ flight: 'BA0048', day: 18 }, { flight: 'BA0257', day: 19 }]);
    expect(a.currency).toBe('USD');
  });
  it('extracts cargo', () => {
    expect(a.pieces).toBe(2);
    expect(a.grossWeight).toBe(121);
    expect(a.weightUnit).toBe('KG');
    expect(a.chargeableWeight).toBe(222.5);
    expect(a.goods).toBe('ULTRASOUND EQUIPMENT');
    expect(a.dimensions).toBe('1PLT@32X31X46(1CTNS);1PLT@32X31X36(1CTNS)');
    expect(a.references).toEqual(expect.arrayContaining(['23711831', '94910058', '4522142063']));
    expect(a.incoterm).toBe('CIP');
  });
  it('extracts execution date', () => {
    expect(a.executedDate).toBe('2026-03-17');
    expect(a.executedPlace).toBe('SEATTLE, WASH');
  });
});

describe('Commercial Invoice (scanned, OCR)', async () => {
  const doc = parseDocument('b', INV, await loadDocText(INV));
  const inv = doc.invoice!;
  it('is classified and OCR-ed', () => {
    expect(doc.type).toBe('invoice');
    expect(doc.method).toBe('ocr');
    expect(doc.pageCount).toBe(2);
  });
  it('extracts header fields', () => {
    expect(inv.invoiceNo).toBe('94910058');
    expect(inv.invoiceDate).toBe('2026-03-13');
    expect(inv.amount).toBe(22919.05);
    expect(inv.currency).toBe('USD');
    expect(inv.orderNo).toBe('23711831');
    expect(inv.orderDate).toBe('2025-12-31');
    expect(inv.customerPo).toBe('4522142063');
    expect(inv.incoterm).toBe('CIP');
    expect(inv.exporter.name).toBe('Philips Ultrasound LLC');
    expect(inv.endUser).toBe('Indraprastha Medical Corporation Limited');
    expect(inv.countryOfOrigin).toBe('USA');
    expect(inv.shipTo.address?.join(' ')).toMatch(/122503/);
  });
  it('extracts line items and packages', () => {
    expect(inv.items).toEqual([
      { hsCode: '9018.12.0000', partNo: '795145', serialNo: 'US326P0085', qty: 1, total: 22919.05, description: 'Ultrasound System 5500G' },
    ]);
    expect(inv.packages).toHaveLength(2);
    expect(inv.grossWeight).toBe(121);
    expect(inv.netWeight).toBe(79);
  });
});
