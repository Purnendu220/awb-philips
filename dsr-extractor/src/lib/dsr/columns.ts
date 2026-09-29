export type ColType = 'text' | 'id' | 'number' | 'money' | 'date' | 'formula';

export interface DsrColumn {
  key: string;
  header: string;
  /** Excel column width, copied from the DSR template. */
  width: number;
  type: ColType;
  /** Header fill in the template: most are yellow, a few are blue. */
  fill: 'yellow' | 'blue';
  options?: string[];
}

const Y = 'yellow' as const;
const B = 'blue' as const;

export const DELAY_REASONS = [
  'CUSTOMS QUERY', 'ICEGATE ISSUE', 'HOLIDAY', 'PART LANDED', 'DOCUMENTS LATE RECD.', 'WEEKEND ARRIVAL',
  'ADC QUERY', 'SINGLE LINE ITEM INVOICE LATE RECD.', 'HSN DELAY', 'CUSTOMS HOLIDAY',
];

/** Columns of the "DSR" sheet, in template order (A..AZ). */
export const COLUMNS: DsrColumn[] = [
  { key: 'srNo', header: 'SR.NO.', width: 7.4, type: 'number', fill: Y },
  { key: 'clearanceMonth', header: 'Clearance Month (OOC Month)', width: 29.6, type: 'text', fill: Y },
  { key: 'status', header: 'STATUS', width: 13.6, type: 'text', fill: Y, options: ['INTRANSIT', 'Cleared'] },
  { key: 'cha', header: 'CHA', width: 11.6, type: 'text', fill: Y, options: ['DHL', 'LCC', 'SKYLINE', 'CARGOMEN'] },
  { key: 'shipper', header: 'SHIPPER NAME', width: 32.6, type: 'text', fill: Y },
  { key: 'invoiceNo', header: 'Invoice no', width: 34.6, type: 'id', fill: Y },
  { key: 'invDate', header: 'Inv. Date', width: 9.4, type: 'date', fill: Y },
  { key: 'invAmt', header: 'Inv. Amt', width: 14.6, type: 'money', fill: Y },
  { key: 'currency', header: 'Currency', width: 11.6, type: 'text', fill: Y, options: ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR'] },
  { key: 'soNo', header: 'S.O. NO.', width: 15.4, type: 'id', fill: Y },
  { key: 'excRate', header: 'Exc. Rate', width: 9, type: 'number', fill: Y },
  { key: 'assessValue', header: 'AssessValue', width: 16.9, type: 'formula', fill: Y },
  { key: 'description', header: 'Item Description', width: 42.4, type: 'text', fill: Y },
  { key: 'blNo', header: 'BL NO./AWB#', width: 18.4, type: 'id', fill: Y },
  { key: 'blDate', header: 'BL DATE', width: 16.4, type: 'date', fill: Y },
  { key: 'shippingLine', header: 'SHIPPING LINE', width: 14.4, type: 'text', fill: Y },
  { key: 'freeDays', header: 'FREE DAYS', width: 15.1, type: 'number', fill: Y },
  { key: 'ft20', header: '20 Feet', width: 17.4, type: 'number', fill: Y },
  { key: 'ft40', header: '40 Feet', width: 8.4, type: 'number', fill: Y },
  { key: 'lcl', header: 'LCL', width: 13, type: 'number', fill: Y },
  { key: 'pol', header: 'PortofLoading', width: 17.4, type: 'text', fill: Y },
  { key: 'pod', header: 'PortofLanding', width: 21.4, type: 'text', fill: Y, options: ['DELHI', 'MUMBAI', 'BANGALORE', 'CHENNAI', 'KOLKATA'] },
  { key: 'importAddress', header: 'IMPORT ADDRESS', width: 22.9, type: 'text', fill: Y, options: ['PHILIPS, GHARI', 'PHILIPS, MUMBAI', 'PHILIPS, KOLKATA', 'PHILIPS, CHENNAI', 'PHILIPS, BANGALORE', 'PHILIPS, DELHI'] },
  { key: 'mode', header: 'Mode of Shipment (AIR/SEA)', width: 26.4, type: 'text', fill: B, options: ['AIR', 'SEA'] },
  { key: 'pkgs', header: 'No of PKG', width: 12.6, type: 'number', fill: Y },
  { key: 'grossWt', header: 'Gross Weight', width: 13.4, type: 'number', fill: Y },
  { key: 'chargeableWt', header: 'Chargeable Weight', width: 17.6, type: 'number', fill: Y },
  { key: 'eta', header: 'ETA Date', width: 10.4, type: 'date', fill: Y },
  { key: 'ata', header: 'ATA Date', width: 13.6, type: 'date', fill: Y },
  { key: 'containerToCfs', header: 'CONTAINER MOVE TO CFS', width: 24.4, type: 'date', fill: Y },
  { key: 'checklistSent', header: 'Checklist Sent date', width: 18.4, type: 'date', fill: Y },
  { key: 'checklistApproved', header: 'ChecklistApprovedDate', width: 22.4, type: 'date', fill: Y },
  { key: 'checklistRemarks', header: 'Checklist remarks', width: 13, type: 'text', fill: Y },
  { key: 'dutyMethod', header: 'Duty payment method', width: 18.4, type: 'text', fill: Y, options: ['TRANSACTION', 'DEFERRED'] },
  { key: 'deferredDutyDate', header: 'Deferred duty payment date throuhg SBI', width: 13, type: 'date', fill: Y },
  { key: 'boeNo', header: 'BOE#', width: 12.4, type: 'id', fill: Y },
  { key: 'beDate', header: 'BE Date', width: 13.4, type: 'date', fill: Y },
  { key: 'dutyReqDate', header: 'Duty Req Date', width: 13.6, type: 'date', fill: Y },
  { key: 'dutyPaidDate', header: 'Duty Paid Date', width: 14, type: 'date', fill: Y },
  { key: 'dutyAmt', header: 'DUTY AMT', width: 15.6, type: 'money', fill: Y },
  { key: 'penalty', header: 'PENALTY', width: 17.4, type: 'money', fill: Y },
  { key: 'penaltyReason', header: 'REASON FOR PENALTY', width: 30, type: 'text', fill: Y },
  { key: 'oocDate', header: 'OOC Date', width: 9.6, type: 'date', fill: B },
  { key: 'endCustomer', header: 'END CUSTOMER (IS)', width: 19, type: 'text', fill: Y },
  { key: 'modality', header: 'MODALITY', width: 10, type: 'text', fill: Y, options: ['PCMS', 'IS', 'US', 'IGTD', 'S&RC'] },
  { key: 'clearanceDays', header: 'CLEARANCE DAYS (TAT Time)', width: 25.4, type: 'number', fill: Y },
  { key: 'delayReason', header: 'DELAY REASON', width: 16.6, type: 'text', fill: Y, options: DELAY_REASONS },
  { key: 'remarks', header: 'Remarks', width: 18.4, type: 'text', fill: Y },
  { key: 'planner', header: 'PLANNER NAME', width: 15, type: 'text', fill: Y },
  { key: 'targetTime', header: 'Target Time', width: 11.4, type: 'number', fill: B },
  { key: 'tatTime', header: 'TAT TIME', width: 13.4, type: 'formula', fill: B },
  { key: 'transitTime', header: 'PORT TO PORT TRANSIT TIME', width: 26.6, type: 'formula', fill: Y },
];

export const COL_INDEX: Record<string, number> = Object.fromEntries(COLUMNS.map((c, i) => [c.key, i]));

/** Excel column letter for a 0-based index (0 -> A, 51 -> AZ). */
export function colLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Public holidays used by the TAT formula (same list as the template's HOLIDAY LIST sheet). */
export const HOLIDAYS: [string, string][] = [
  ['2026-01-01', 'New Year'],
  ['2026-01-26', 'Republic day'],
  ['2026-03-04', 'HOLI'],
  ['2026-04-03', 'GOOD FRIDAY'],
  ['2026-05-28', 'Bakra Eid'],
  ['2025-10-02', 'GANDHI JAYANTI'],
  ['2026-10-20', 'Dushera'],
  ['2026-11-10', 'Diwali'],
  ['2026-11-24', 'Guru Nanak Jayanti'],
  ['2025-12-25', 'Christmas'],
];
