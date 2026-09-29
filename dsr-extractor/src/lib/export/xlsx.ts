import type { Workbook, Worksheet } from 'exceljs';
import { COL_INDEX, COLUMNS, colLetter, HOLIDAYS } from '../dsr/columns';
import type { Shipment } from '../dsr/group';
import type { DsrRow } from '../dsr/mapping';
import type { ExtractedDoc } from '../types';

const FONT = { name: 'Aptos Narrow', size: 11 };
const FILL = { yellow: 'FFFFFF00', blue: 'FF00B0F0' };
const DATE_FMT = '[$-409]d-mmm-yy;@';
const MONEY_FMT = '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)';
const THIN = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const L = (key: string) => colLetter(COL_INDEX[key]);

function toDate(iso: unknown): Date | undefined {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Digit-only references are stored as numbers, like the template (Excel keeps 15 digits exactly). */
function idValue(v: unknown): string | number {
  const s = String(v).trim();
  return /^[1-9]\d{0,14}$/.test(s) ? Number(s) : s;
}

function styleHeader(ws: Worksheet, fill: (i: number) => string, height = 30) {
  const row = ws.getRow(1);
  row.height = height;
  row.eachCell((cell, i) => {
    cell.font = { ...FONT, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill(i - 1) } };
    cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    cell.border = BORDER;
  });
}

function addDsrSheet(wb: Workbook, rows: DsrRow[]) {
  const ws = wb.addWorksheet('DSR', { views: [{ state: 'frozen', xSplit: 5, ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  styleHeader(ws, (i) => FILL[COLUMNS[i].fill]);

  rows.forEach((row, idx) => {
    const r = idx + 2;
    const xr = ws.getRow(r);
    COLUMNS.forEach((c, ci) => {
      const cell = xr.getCell(ci + 1);
      const v = row[c.key]?.v;
      cell.font = FONT;
      if (c.type === 'formula') {
        const result = typeof v === 'number' ? v : undefined;
        if (c.key === 'assessValue') cell.value = { formula: `${L('excRate')}${r}*${L('invAmt')}${r}`, result };
        if (c.key === 'tatTime') cell.value = { formula: `NETWORKDAYS(${L('ata')}${r},${L('oocDate')}${r},'HOLIDAY LIST'!$A$2:$A$${HOLIDAYS.length + 1})`, result };
        if (c.key === 'transitTime') cell.value = { formula: `${L('ata')}${r}-${L('blDate')}${r}`, result };
        cell.numFmt = c.key === 'assessValue' ? MONEY_FMT : c.key === 'tatTime' ? '0.00' : 'General';
        return;
      }
      if (v === null || v === undefined || v === '') return;
      if (c.type === 'date') {
        const d = toDate(v);
        cell.value = d ?? String(v);
        if (d) cell.numFmt = DATE_FMT;
      } else if (c.type === 'money') {
        cell.value = typeof v === 'number' ? v : Number(v) || String(v);
        cell.numFmt = MONEY_FMT;
      } else if (c.type === 'number') {
        cell.value = typeof v === 'number' ? v : Number(v) || String(v);
      } else if (c.type === 'id') {
        cell.value = idValue(v);
      } else {
        cell.value = String(v);
      }
    });
  });
  ws.autoFilter = { from: 'A1', to: `${colLetter(COLUMNS.length - 1)}${Math.max(rows.length + 1, 1)}` };
}

function addHolidaySheet(wb: Workbook) {
  const ws = wb.addWorksheet('HOLIDAY LIST');
  ws.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Holiday', key: 'name', width: 24 },
  ];
  styleHeader(ws, () => FILL.yellow, 18);
  for (const [iso, name] of HOLIDAYS) {
    const row = ws.addRow({ date: toDate(iso), name });
    row.getCell(1).numFmt = DATE_FMT;
    row.font = FONT;
  }
}

const join = (xs: (string | undefined)[] | undefined, sep = ', ') => (xs ?? []).filter(Boolean).join(sep) || undefined;

function addDetailsSheet(wb: Workbook, shipments: Shipment[]) {
  const ws = wb.addWorksheet('Extracted Details', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  const cols: [string, number, (d: ExtractedDoc) => unknown][] = [
    ['Shipment #', 11, () => undefined],
    ['File', 40, (d) => d.fileName],
    ['Document Type', 16, (d) => ({ awb: 'Air Waybill', invoice: 'Commercial Invoice', bl: 'Bill of Lading', packing: 'Packing List', unknown: 'Unknown' })[d.type]],
    ['Read Method', 12, (d) => (d.method === 'ocr' ? 'OCR' : d.method === 'mixed' ? 'Text + OCR' : 'Text')],
    ['OCR Confidence %', 12, (d) => d.ocrConfidence],
    ['Invoice No', 14, (d) => d.invoice?.invoiceNo],
    ['Invoice Date', 12, (d) => toDate(d.invoice?.invoiceDate)],
    ['Invoice Amount', 14, (d) => d.invoice?.amount],
    ['Currency', 9, (d) => d.invoice?.currency ?? d.awb?.currency],
    ['Order No', 12, (d) => d.invoice?.orderNo],
    ['Order Date', 12, (d) => toDate(d.invoice?.orderDate)],
    ['Customer PO', 14, (d) => d.invoice?.customerPo],
    ['Incoterm', 9, (d) => d.invoice?.incoterm ?? d.awb?.incoterm],
    ['Shipping Terms', 18, (d) => d.invoice?.shippingTerms],
    ['Exporter', 26, (d) => d.invoice?.exporter.name],
    ['Bill To', 26, (d) => join([d.invoice?.billTo.name, ...(d.invoice?.billTo.address ?? [])])],
    ['Ship To', 30, (d) => join([d.invoice?.shipTo.name, ...(d.invoice?.shipTo.address ?? [])])],
    ['End User', 30, (d) => d.invoice?.endUser],
    ['Country of Origin', 12, (d) => d.invoice?.countryOfOrigin],
    ['HAWB / BL No', 16, (d) => d.awb?.hawb ?? d.bl?.blNo],
    ['MAWB', 14, (d) => d.awb?.mawb],
    ['AWB / BL Date', 12, (d) => toDate(d.awb?.executedDate ?? d.bl?.blDate)],
    ['Shipper', 28, (d) => join([d.awb?.shipper.name ?? d.bl?.shipper.name, ...(d.awb?.shipper.address ?? d.bl?.shipper.address ?? [])])],
    ['Consignee', 30, (d) => join([d.awb?.consignee.name ?? d.bl?.consignee.name, ...(d.awb?.consignee.address ?? d.bl?.consignee.address ?? [])])],
    ['Forwarder / Agent', 26, (d) => join([d.awb?.agent.name, d.awb?.agentIata])],
    ['Departure / POL', 14, (d) => d.awb?.departure ?? d.bl?.portOfLoading],
    ['Destination / POD', 14, (d) => d.awb?.destination ?? d.bl?.portOfDischarge],
    ['Routing', 18, (d) => join(d.awb?.routing.map((r) => (r.by ? `${r.to} (${r.by})` : r.to)), ' > ')],
    ['Flights', 18, (d) => join(d.awb?.flights.map((f) => `${f.flight}/${f.day}`))],
    ['Vessel', 18, (d) => d.bl?.vessel],
    ['Containers', 18, (d) => join(d.bl?.containers.map((c) => (c.size ? `${c.no} (${c.size}')` : c.no)))],
    ['Pieces', 8, (d) => d.awb?.pieces ?? d.bl?.packages ?? (d.invoice?.packages.length || undefined)],
    ['Gross Weight', 10, (d) => d.awb?.grossWeight ?? d.bl?.grossWeight ?? d.invoice?.grossWeight],
    ['Chargeable Weight', 10, (d) => d.awb?.chargeableWeight],
    ['Net Weight', 10, (d) => d.invoice?.netWeight],
    ['Goods', 28, (d) => d.awb?.goods ?? d.bl?.goods],
    ['Dimensions', 30, (d) => d.awb?.dimensions ?? join(d.invoice?.packages.map((p) => p.dims))],
    ['References', 30, (d) => join(d.awb?.references)],
    ['Handling Information', 50, (d) => d.awb?.handling],
    ['Warnings', 40, (d) => join(d.warnings, '; ')],
  ];
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  styleHeader(ws, () => 'FFD9E1F2');
  for (const s of shipments)
    for (const d of s.docs) {
      const row = ws.addRow(cols.map(([h, , f]) => (h === 'Shipment #' ? s.no : (f(d) ?? null))));
      row.font = FONT;
      row.eachCell((cell) => {
        if (cell.value instanceof Date) cell.numFmt = DATE_FMT;
      });
      row.getCell(8).numFmt = MONEY_FMT;
    }
  ws.autoFilter = { from: 'A1', to: `${colLetter(cols.length - 1)}1` };
}

function addItemsSheet(wb: Workbook, shipments: Shipment[]) {
  const ws = wb.addWorksheet('Line Items', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Shipment #', key: 'no', width: 11 },
    { header: 'Invoice No', key: 'inv', width: 14 },
    { header: 'HS Code', key: 'hs', width: 14 },
    { header: 'Part No', key: 'part', width: 14 },
    { header: 'Serial No', key: 'serial', width: 14 },
    { header: 'Description', key: 'desc', width: 40 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Unit Price', key: 'unit', width: 12 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Currency', key: 'cur', width: 9 },
    { header: 'File', key: 'file', width: 40 },
  ];
  styleHeader(ws, () => 'FFD9E1F2');
  for (const s of shipments)
    for (const d of s.docs)
      for (const it of d.invoice?.items ?? []) {
        const row = ws.addRow({
          no: s.no, inv: d.invoice?.invoiceNo ? idValue(d.invoice.invoiceNo) : null, hs: it.hsCode, part: it.partNo ? idValue(it.partNo) : null,
          serial: it.serialNo, desc: it.description, qty: it.qty, unit: it.unitPrice, total: it.total, cur: d.invoice?.currency, file: d.fileName,
        });
        row.font = FONT;
        row.getCell('unit').numFmt = MONEY_FMT;
        row.getCell('total').numFmt = MONEY_FMT;
      }
}

export async function buildWorkbook(rows: DsrRow[], shipments: Shipment[]): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DSR Builder';
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  addDsrSheet(wb, rows);
  addDetailsSheet(wb, shipments);
  addItemsSheet(wb, shipments);
  addHolidaySheet(wb);
  return wb;
}

export async function downloadXlsx(rows: DsrRow[], shipments: Shipment[], fileName: string) {
  const wb = await buildWorkbook(rows, shipments);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
