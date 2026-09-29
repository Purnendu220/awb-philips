import { writeFileSync, mkdirSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { COL_INDEX, colLetter } from '../src/lib/dsr/columns';
import { groupDocs } from '../src/lib/dsr/group';
import { buildRow, computeFormulas, DEFAULTS, networkDays } from '../src/lib/dsr/mapping';
import { buildWorkbook } from '../src/lib/export/xlsx';
import { parseDocument } from '../src/lib/parse';
import type { ExtractedDoc } from '../src/lib/types';
import { closeOcr, loadDocText } from './helpers';

const AWB = '2620619335_4030515970_House Airway Bill.pdf';
const INV = '2620619335_F032083892_Commercial Invoice.pdf';

afterAll(closeOcr);

describe('helpers', () => {
  it('networkDays matches Excel NETWORKDAYS', () => {
    expect(networkDays('2026-03-20', '2026-03-20')).toBe(1);
    expect(networkDays('2026-03-20', '2026-03-23')).toBe(2); // Fri -> Mon
    expect(networkDays('2026-03-03', '2026-03-05')).toBe(2); // Holi on 4-Mar
  });
  it('colLetter', () => {
    expect(colLetter(0)).toBe('A');
    expect(colLetter(25)).toBe('Z');
    expect(colLetter(51)).toBe('AZ');
    expect(colLetter(COL_INDEX.oocDate)).toBe('AQ');
  });
});

describe('DSR row for the sample shipment', async () => {
  const docs: ExtractedDoc[] = [
    parseDocument('inv', INV, await loadDocText(INV)),
    parseDocument('awb', AWB, await loadDocText(AWB)),
  ];
  const shipments = groupDocs(docs);
  const row = computeFormulas(buildRow(shipments[0], { ...DEFAULTS, excRate: '92.5' }));
  const v = (k: string) => row[k].v;

  it('groups AWB and invoice into one shipment', () => {
    expect(shipments).toHaveLength(1);
    expect(shipments[0].docs.map((d) => d.id).sort()).toEqual(['awb', 'inv']);
  });

  // Expected values are row 774 of DSR_FORMAT-2026-27.xlsx, where this shipment was keyed in by hand.
  it('matches the manually keyed DSR row', () => {
    expect(v('shipper')).toBe('PHILIPS ULTRASOUND LLC');
    expect(v('invoiceNo')).toBe('94910058');
    expect(v('invDate')).toBe('2026-03-13');
    expect(v('invAmt')).toBe(22919.05);
    expect(v('currency')).toBe('USD');
    expect(v('description')).toBe('ULTRASOUND SYSTEM 5500G');
    expect(v('blNo')).toBe('4030515970');
    expect(v('blDate')).toBe('2026-03-17');
    expect(v('pol')).toBe('SEATTLE');
    expect(v('pod')).toBe('DELHI');
    expect(v('importAddress')).toBe('PHILIPS, GHARI');
    expect(v('mode')).toBe('AIR');
    expect(v('pkgs')).toBe(2);
    expect(v('grossWt')).toBe(121);
    expect(v('chargeableWt')).toBe(222.5);
    expect(v('eta')).toBe('2026-03-20');
    expect(v('modality')).toBe('US');
    expect(v('targetTime')).toBe(2);
    expect(v('status')).toBe('INTRANSIT');
    expect(v('endCustomer')).toBeNull();
    expect(v('assessValue')).toBe(2120012.13);
  });

  it('writes an XLSX in the DSR layout', async () => {
    const wb = await buildWorkbook([row], shipments);
    const buf = await wb.xlsx.writeBuffer();
    mkdirSync('.scratch', { recursive: true });
    writeFileSync('.scratch/test-export.xlsx', Buffer.from(buf));

    const ExcelJS = (await import('exceljs')).default;
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf);
    expect(back.worksheets.map((w) => w.name)).toEqual(['DSR', 'Extracted Details', 'Line Items', 'HOLIDAY LIST']);
    const ws = back.getWorksheet('DSR')!;
    expect(ws.getCell('A1').value).toBe('SR.NO.');
    expect(ws.getCell('AZ1').value).toBe('PORT TO PORT TRANSIT TIME');
    expect(ws.getCell('F2').value).toBe(94910058);
    expect(ws.getCell('N2').value).toBe(4030515970);
    expect((ws.getCell('O2').value as Date).toISOString().slice(0, 10)).toBe('2026-03-17');
    expect(ws.getCell('L2').formula).toBe('K2*H2');
    expect(ws.getCell('AY2').formula).toBe("NETWORKDAYS(AC2,AQ2,'HOLIDAY LIST'!$A$2:$A$11)");
    expect(ws.getCell('AZ2').formula).toBe('AC2-O2');
    const items = back.getWorksheet('Line Items')!;
    expect(items.getCell('F2').value).toBe('Ultrasound System 5500G');
  });
});
