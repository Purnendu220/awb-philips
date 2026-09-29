const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03-17" -> "17-Mar-2026" */
export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${MON[+m[2] - 1]}-${m[1]}` : iso;
}

export function fmtNum(n: number | undefined | null, decimals?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '';
  return n.toLocaleString('en-IN', decimals === undefined ? { maximumFractionDigits: 3 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const DOC_LABEL = { awb: 'Air Waybill', invoice: 'Invoice', bl: 'Bill of Lading', packing: 'Packing List', unknown: 'Unknown' } as const;
