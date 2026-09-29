import type { AwbData, BlData, ExtractedDoc, InvoiceData } from '../types';
import { addDays } from '../parse/util';
import { COLUMNS, HOLIDAYS } from './columns';
import type { Shipment } from './group';

export type Source = 'awb' | 'invoice' | 'bl' | 'derived' | 'default' | 'manual';
export type CellValue = string | number | null;

export interface Cell {
  v: CellValue;
  src?: Source;
  /** Where the value came from / how it was derived (shown as a tooltip). */
  note?: string;
}

export type DsrRow = Record<string, Cell>;

export interface Defaults {
  status: string;
  cha: string;
  excRate: string;
  planner: string;
  targetTime: string;
}

export const DEFAULTS: Defaults = { status: 'INTRANSIT', cha: '', excRate: '', planner: '', targetTime: '2' };

const PORT_ALIASES: Record<string, string> = {
  'NEW DELHI': 'DELHI', BENGALURU: 'BANGALORE', BANGALURU: 'BANGALORE', CALCUTTA: 'KOLKATA', MADRAS: 'CHENNAI',
  BOMBAY: 'MUMBAI', 'NHAVA SHEVA': 'MUMBAI', JNPT: 'MUMBAI', 'NAVA SHEVA': 'MUMBAI', 'SAHAR': 'MUMBAI',
  'INDEL': 'DELHI', 'INBOM': 'MUMBAI', 'INMAA': 'CHENNAI', 'INBLR': 'BANGALORE', 'INCCU': 'KOLKATA', 'INNSA': 'MUMBAI',
};

export function normalizePort(p: string | undefined): string | undefined {
  if (!p) return undefined;
  const t = p.toUpperCase().trim();
  return PORT_ALIASES[t] ?? t;
}

/** Modality from shipper / item text, following how the DSR history classifies shipments. */
export function modalityFor(shipper = '', description = ''): { v: string; note: string } | undefined {
  const s = shipper.toUpperCase();
  const d = description.toUpperCase();
  if (/ULTRASOUND|\bATL\b/.test(s) || /ULTRASOUND|AFFINITI|EPIQ|CLEAR\s?VUE|LUMIFY/.test(d)) return { v: 'US', note: 'Ultrasound shipper/product' };
  if (/\bIGT\b/.test(s)) return { v: 'IGTD', note: 'IGT shipper' };
  if (/\bRS\b|RESPIRONICS/.test(s)) return { v: 'S&RC', note: 'Respironics (RS) shipper' };
  if (/BARCO/.test(s)) return { v: 'IS', note: 'Barco shipper' };
  if (/AZURION|ALLURA|HEMO|BIG\s?BORE|INGENIA|\bCT\b|\bMRI?\b|INCISIVE|SPECTRAL|DIGITALDIAGNOST|COMBIDIAGNOST|MOBILEDIAGNOST/.test(d))
    return { v: 'IS', note: 'Imaging system product' };
  if (/MEDIZIN|GOLDWAY|\bCS\b|PHILIPS/.test(s)) return { v: 'PCMS', note: 'Default modality for this shipper' };
  return undefined;
}

/** Warehouse short name from a consignee / ship-to address. */
export function importAddressFor(text: string): { v: string; note: string } | undefined {
  const t = text.toUpperCase();
  if (/GHARI|PATAUDI|122503|KILA\s*NO/.test(t)) return { v: 'PHILIPS, GHARI', note: 'Gurugram (Ghari / Pataudi Road) warehouse address' };
  if (!/PHILIPS/.test(t)) return undefined;
  const city = [
    [/MUMBAI|BOMBAY|THANE|BHIWANDI/, 'MUMBAI'],
    [/CHENNAI/, 'CHENNAI'],
    [/KOLKATA|CALCUTTA/, 'KOLKATA'],
    [/BANGALORE|BENGALURU/, 'BANGALORE'],
  ].find(([re]) => (re as RegExp).test(t))?.[1] as string | undefined;
  return city ? { v: `PHILIPS, ${city}`, note: 'City in consignee address' } : undefined;
}

/** Excel NETWORKDAYS: inclusive weekday count excluding holidays (negative when end < start). */
export function networkDays(startIso: string, endIso: string, holidays = HOLIDAYS.map((h) => h[0])): number {
  const start = new Date(startIso + 'T00:00:00Z');
  const end = new Date(endIso + 'T00:00:00Z');
  const sign = end >= start ? 1 : -1;
  const [a, b] = sign > 0 ? [start, end] : [end, start];
  const hol = new Set(holidays);
  let n = 0;
  for (const d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !hol.has(d.toISOString().slice(0, 10))) n++;
  }
  return sign * n;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function fmtDay(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCDate()}-${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
}

type Setter = (key: string, v: CellValue | undefined, src: Source, note?: string) => void;

/** Builds the DSR row for one shipment from its documents plus the user's defaults. */
export function buildRow(shipment: Shipment, defaults: Defaults): DsrRow {
  const row: DsrRow = Object.fromEntries(COLUMNS.map((c) => [c.key, { v: null }]));
  const set: Setter = (key, v, src, note) => {
    if (v === undefined || v === null || v === '') return;
    row[key] = { v, src, note };
  };

  const awbDoc = shipment.docs.find((d) => d.awb);
  const blDoc = shipment.docs.find((d) => d.bl);
  const invDocs = shipment.docs.filter((d) => d.invoice && d.type === 'invoice');
  const invs = invDocs.map((d) => d.invoice!);

  set('srNo', shipment.no, 'derived');
  set('status', defaults.status, 'default');
  set('cha', defaults.cha, 'default');
  set('planner', defaults.planner, 'default');
  if (defaults.excRate) set('excRate', Number(defaults.excRate) || defaults.excRate, 'default');

  // Shipper: the AWB/BL shipper box is what the DSR history uses.
  const transport = awbDoc ?? blDoc;
  const shipper = awbDoc?.awb?.shipper.name ?? blDoc?.bl?.shipper.name;
  if (shipper) set('shipper', shipper.toUpperCase(), awbDoc ? 'awb' : 'bl', `Shipper on ${transport!.fileName}`);
  else if (invs[0]?.exporter.name) set('shipper', invs[0].exporter.name.toUpperCase(), 'invoice', `Exporter on ${invDocs[0].fileName}`);

  applyInvoices(invDocs, set);
  if (awbDoc?.awb) applyAwb(awbDoc.awb, set);
  else if (blDoc?.bl) applyBl(blDoc.bl, set);
  if (row.currency.v === null) set('currency', awbDoc?.awb?.currency, 'awb');

  const invDesc = mainDescription(invs);
  if (invDesc) set('description', invDesc.toUpperCase(), 'invoice', 'Highest-value invoice line');
  else if (awbDoc?.awb?.goods) set('description', awbDoc.awb.goods.toUpperCase(), 'awb', 'Nature of goods on AWB');
  else set('description', blDoc?.bl?.goods?.toUpperCase(), 'bl');

  // Fall back to invoice / packing list cargo details.
  const packing = shipment.docs.filter((d) => d.invoice).map((d) => d.invoice!);
  if (row.pkgs.v === null) set('pkgs', packing.find((p) => p.packages.length)?.packages.length, 'invoice', 'Packages listed on invoice');
  if (row.grossWt.v === null) set('grossWt', packing.find((p) => p.grossWeight)?.grossWeight, 'invoice');

  const addrText = [awbDoc?.awb?.consignee, blDoc?.bl?.consignee, ...invs.map((i) => i.shipTo)]
    .flatMap((p) => (p ? [p.name ?? '', ...(p.address ?? [])] : []))
    .join(' ');
  const addr = importAddressFor(addrText);
  if (addr) set('importAddress', addr.v, 'derived', addr.note);

  const mod = modalityFor(String(row.shipper.v ?? ''), String(row.description.v ?? ''));
  if (mod) set('modality', mod.v, 'derived', mod.note);
  const endUser = invs.find((i) => i.endUser)?.endUser;
  if (endUser && mod?.v === 'IS') set('endCustomer', endUser, 'invoice', 'End user on invoice');
  set('targetTime', Number(defaults.targetTime) || undefined, 'default');
  return row;
}

/** Invoice number/date/amount; several invoices are joined with "/" like the DSR does. */
function applyInvoices(invDocs: ExtractedDoc[], set: Setter) {
  const invs = invDocs.map((d) => d.invoice!);
  const invNos = invs.map((i) => i.invoiceNo).filter(Boolean) as string[];
  set('invoiceNo', invNos.join('/'), 'invoice', invDocs.map((d) => d.fileName).join(', '));
  const dates = (invs.map((i) => i.invoiceDate).filter(Boolean) as string[]).sort((a, b) => a.localeCompare(b));
  set('invDate', dates[0], 'invoice');
  const amounts = invs.map((i) => i.amount).filter((a): a is number => a !== undefined);
  if (amounts.length) {
    const total = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
    set('invAmt', total, 'invoice', amounts.length > 1 ? `Sum of ${amounts.length} invoices` : undefined);
  }
  set('currency', invs.find((i) => i.currency)?.currency, 'invoice');
}

function applyAwb(awb: AwbData, set: Setter) {
  set('blNo', awb.hawb ?? awb.mawb, 'awb', awb.hawb ? 'House AWB number' : 'Master AWB number');
  set('blDate', awb.executedDate, 'awb', 'AWB execution date');
  set('pol', awb.departure?.toUpperCase(), 'awb', 'Airport of departure');
  set('pod', normalizePort(awb.destination), 'awb', 'Airport of destination');
  set('mode', 'AIR', 'derived', 'Air Waybill');
  set('pkgs', awb.pieces, 'awb');
  const lb = awb.weightUnit === 'LB';
  const toKg = (n?: number) => (n !== undefined && lb ? Math.round(n * 0.45359237 * 100) / 100 : n);
  const note = lb ? 'Converted from LB' : undefined;
  set('grossWt', toKg(awb.grossWeight), 'awb', note);
  set('chargeableWt', toKg(awb.chargeableWeight), 'awb', note);
  const eta = etaFromFlights(awb.executedDate, awb.flights);
  if (eta) set('eta', eta.iso, 'derived', eta.note);
}

function applyBl(bl: BlData, set: Setter) {
  set('blNo', bl.blNo, 'bl');
  set('blDate', bl.blDate, 'bl');
  set('shippingLine', bl.carrier, 'bl');
  set('pol', bl.portOfLoading?.toUpperCase(), 'bl');
  set('pod', normalizePort(bl.portOfDischarge), 'bl');
  set('mode', 'SEA', 'derived', 'Bill of Lading');
  set('pkgs', bl.packages, 'bl');
  set('grossWt', bl.grossWeight, 'bl');
  set('chargeableWt', bl.grossWeight, 'bl', 'Sea freight: gross weight');
  set('ft20', bl.containers.filter((c) => c.size === '20').length || undefined, 'bl');
  set('ft40', bl.containers.filter((c) => c.size === '40').length || undefined, 'bl');
  if (bl.lcl) set('lcl', 1, 'bl');
}

function mainDescription(invs: InvoiceData[]): string | undefined {
  const items = invs.flatMap((i) => i.items).filter((i) => i.description);
  items.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  return items[0]?.description;
}

/** ETA estimate: last requested flight's date (day-of-month relative to AWB date) + 1 day for overnight arrival. */
function etaFromFlights(executed: string | undefined, flights: { flight: string; day: number }[]) {
  const last = flights.at(-1);
  if (!executed || !last) return undefined;
  const [y, m, d] = executed.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + (last.day < d - 3 ? 1 : 0), last.day));
  const depart = base.toISOString().slice(0, 10);
  return { iso: addDays(depart, 1), note: `Estimated: last flight ${last.flight} on ${fmtDay(depart)} + 1 day` };
}

/** Values of formula columns for display (the XLSX gets real formulas). */
export function computeFormulas(row: DsrRow): DsrRow {
  const num = (k: string) => (typeof row[k].v === 'number' ? (row[k].v as number) : Number(row[k].v) || undefined);
  const date = (k: string) => (typeof row[k].v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row[k].v as string) ? (row[k].v as string) : undefined);
  const out = { ...row };
  const rate = num('excRate'), amt = num('invAmt');
  out.assessValue = { v: rate && amt ? Math.round(rate * amt * 100) / 100 : null, src: 'derived', note: 'Exc. Rate x Inv. Amt' };
  const ata = date('ata'), ooc = date('oocDate'), bld = date('blDate');
  out.tatTime = { v: ata && ooc ? networkDays(ata, ooc) : null, src: 'derived', note: 'NETWORKDAYS(ATA, OOC, holidays)' };
  out.transitTime = { v: ata && bld ? daysBetween(bld, ata) : null, src: 'derived', note: 'ATA - BL date' };
  return out;
}
