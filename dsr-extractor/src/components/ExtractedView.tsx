import type { ReactNode } from 'react';
import type { Shipment } from '../lib/dsr/group';
import { DOC_LABEL, fmtDate, fmtNum } from '../lib/format';
import type { ExtractedDoc, Party } from '../lib/types';
import { Icon } from './Icon';

type Field = [string, ReactNode];

const party = (p: Party | undefined) =>
  p?.name ? (
    <>
      <strong>{p.name}</strong>
      {p.address?.map((a, i) => (
        <div key={i}>{a}</div>
      ))}
    </>
  ) : undefined;

function fieldsFor(d: ExtractedDoc): Field[] {
  const i = d.invoice;
  const a = d.awb;
  const b = d.bl;
  if (i)
    return [
      ['Invoice No', i.invoiceNo],
      ['Invoice Date', fmtDate(i.invoiceDate)],
      ['Amount', i.amount !== undefined ? `${i.currency ?? ''} ${fmtNum(i.amount, 2)}` : undefined],
      ['Order No', i.orderNo],
      ['Order Date', fmtDate(i.orderDate)],
      ['Customer PO', i.customerPo],
      ['Ship Date', fmtDate(i.shipDate)],
      ['Terms', i.shippingTerms ?? i.incoterm],
      ['Country of Origin', i.countryOfOrigin],
      ['Packages', i.packages.length ? `${i.packages.length} (gross ${fmtNum(i.grossWeight)} kg${i.netWeight ? `, net ${fmtNum(i.netWeight)} kg` : ''})` : undefined],
      ['Exporter', party(i.exporter)],
      ['Ship To', party(i.shipTo)],
      ['Bill To', party(i.billTo)],
      ['End User', i.endUser],
    ];
  if (a)
    return [
      ['HAWB', a.hawb],
      ['MAWB', a.mawb],
      ['AWB Date', fmtDate(a.executedDate)],
      ['Place', a.executedPlace],
      ['Departure', a.departure],
      ['Destination', a.destination],
      ['Routing', a.routing.map((r) => (r.by ? `${r.to} (${r.by})` : r.to)).join(' > ') || undefined],
      ['Flights', a.flights.map((f) => `${f.flight} / ${f.day}`).join(', ') || undefined],
      ['Pieces', a.pieces],
      ['Gross Weight', a.grossWeight !== undefined ? `${fmtNum(a.grossWeight)} ${a.weightUnit ?? ''}` : undefined],
      ['Chargeable Wt', a.chargeableWeight !== undefined ? fmtNum(a.chargeableWeight) : undefined],
      ['Goods', a.goods],
      ['Details', a.goodsDetails.length ? a.goodsDetails.join(' / ') : undefined],
      ['Dimensions', a.dimensions],
      ['Shipper', party(a.shipper)],
      ['Consignee', party(a.consignee)],
      ['Agent', party(a.agent)],
      ['Agent IATA', a.agentIata],
      ['References', a.references.join(', ') || undefined],
      ['Handling Info', a.handling],
    ];
  if (b)
    return [
      ['B/L No', b.blNo],
      ['B/L Date', fmtDate(b.blDate)],
      ['Carrier', b.carrier],
      ['Vessel', b.vessel],
      ['Port of Loading', b.portOfLoading],
      ['Port of Discharge', b.portOfDischarge],
      ['Containers', b.containers.map((c) => (c.size ? `${c.no} (${c.size}')` : c.no)).join(', ') || undefined],
      ['LCL', b.lcl ? 'Yes' : undefined],
      ['Packages', b.packages],
      ['Gross Weight', b.grossWeight !== undefined ? fmtNum(b.grossWeight) : undefined],
      ['Goods', b.goods],
      ['Shipper', party(b.shipper)],
      ['Consignee', party(b.consignee)],
    ];
  return [];
}

export function ExtractedView({ shipments, onView }: { shipments: Shipment[]; onView: (d: ExtractedDoc) => void }) {
  return (
    <div className="details">
      {shipments.map((s) => (
        <div key={s.key} className="shipment">
          <div className="shipment-head">
            <span className="shipment-no">Shipment #{s.no}</span>
            <span className="muted">
              {s.docs.length} document{s.docs.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="doc-grid">
            {s.docs.map((d) => {
              const fields = fieldsFor(d).filter(([, v]) => v !== undefined && v !== '' && v !== null);
              return (
                <article key={d.id} className="doc-card">
                  <header>
                    <span className={`pill pill-${d.type}`}>{DOC_LABEL[d.type]}</span>
                    <span className="doc-file" title={d.fileName}>
                      {d.fileName}
                    </span>
                    <button className="icon-btn" onClick={() => onView(d)} title="View extracted text" aria-label="View extracted text">
                      <Icon name="eye" />
                    </button>
                  </header>
                  {fields.length ? (
                    <dl className="kv">
                      {fields.map(([k, v]) => (
                        <div key={k} className="kv-row">
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <div className="empty small">
                      <Icon name="info" /> No structured fields recognised. Use "View text" to see what was read.
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
