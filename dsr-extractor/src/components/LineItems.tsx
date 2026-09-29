import type { Shipment } from '../lib/dsr/group';
import { fmtNum } from '../lib/format';
import { Icon } from './Icon';

export function LineItems({ shipments }: { shipments: Shipment[] }) {
  const rows = shipments.flatMap((s) =>
    s.docs.flatMap((d) => (d.invoice?.items ?? []).map((it, i) => ({ key: `${d.id}-${i}`, no: s.no, inv: d.invoice!.invoiceNo, cur: d.invoice!.currency, it }))),
  );
  if (!rows.length)
    return (
      <div className="empty">
        <Icon name="receipt" size={28} />
        <div>No invoice line items found.</div>
      </div>
    );
  const total = rows.reduce((s, r) => s + (r.it.total ?? 0), 0);
  return (
    <div className="table-scroll">
      <table className="report">
        <thead>
          <tr>
            <th>Shipment</th>
            <th>Invoice No</th>
            <th>HS Code</th>
            <th>Part No</th>
            <th>Serial No</th>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Unit Price</th>
            <th className="num">Total</th>
            <th>Cur.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>#{r.no}</td>
              <td className="mono">{r.inv}</td>
              <td className="mono">{r.it.hsCode}</td>
              <td className="mono">{r.it.partNo}</td>
              <td className="mono">{r.it.serialNo}</td>
              <td>{r.it.description}</td>
              <td className="num">{fmtNum(r.it.qty)}</td>
              <td className="num">{fmtNum(r.it.unitPrice, 2)}</td>
              <td className="num">{fmtNum(r.it.total, 2)}</td>
              <td>{r.cur}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr>
              <td colSpan={8}>Total</td>
              <td className="num">{fmtNum(total, 2)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
