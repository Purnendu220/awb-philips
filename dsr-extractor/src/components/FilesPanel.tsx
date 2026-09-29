import type { Shipment } from '../lib/dsr/group';
import { DOC_LABEL, fmtBytes } from '../lib/format';
import type { ExtractedDoc } from '../lib/types';
import { Icon } from './Icon';

export interface FileEntry {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'queued' | 'processing' | 'done' | 'error';
  progress: number;
  statusText: string;
  doc?: ExtractedDoc;
  error?: string;
}

interface Props {
  files: FileEntry[];
  shipments: Shipment[];
  manualGroups: Record<string, string>;
  onGroup: (docId: string, key: string) => void;
  onRemove: (id: string) => void;
  onView: (doc: ExtractedDoc) => void;
}

const TYPE_ICON = { awb: 'plane', invoice: 'receipt', bl: 'ship', packing: 'file', unknown: 'file' };

export function FilesPanel({ files, shipments, onGroup, onRemove, onView }: Props) {
  return (
    <div className="card files">
      <div className="card-head">
        <h2>Files</h2>
        <span className="muted">
          {files.filter((f) => f.status === 'done').length} of {files.length} processed
        </span>
      </div>
      <ul className="file-list">
        {files.map((f) => {
          const shipment = shipments.find((s) => s.docs.some((d) => d.id === f.id));
          return (
            <li key={f.id} className={`file-row ${f.status}`}>
              <span className={`file-icon t-${f.doc?.type ?? 'pending'}`}>
                <Icon name={f.doc ? TYPE_ICON[f.doc.type] : 'file'} />
              </span>
              <div className="file-main">
                <div className="file-name" title={f.name}>
                  {f.name}
                </div>
                <div className="file-meta">
                  <span>{fmtBytes(f.size)}</span>
                  {f.doc && (
                    <>
                      <span className={`pill pill-${f.doc.type}`}>{DOC_LABEL[f.doc.type]}</span>
                      <span>
                        {f.doc.pageCount} page{f.doc.pageCount > 1 ? 's' : ''}
                      </span>
                      <span className="pill pill-soft" title={f.doc.method === 'text' ? 'Read from the PDF text layer' : 'Scanned image - read with OCR'}>
                        {f.doc.method === 'text' ? 'Text' : `OCR ${f.doc.ocrConfidence ?? ''}%`}
                      </span>
                    </>
                  )}
                  {f.status === 'error' && <span className="err">{f.error}</span>}
                </div>
                {(f.status === 'processing' || f.status === 'queued') && (
                  <div className="progress" aria-label={f.statusText}>
                    <div className="progress-bar" style={{ width: `${Math.round(f.progress * 100)}%` }} />
                    <span className="progress-text">{f.statusText}</span>
                  </div>
                )}
                {f.doc?.warnings.map((w) => (
                  <div key={w} className="warn">
                    <Icon name="alert" size={13} /> {w}
                  </div>
                ))}
              </div>
              {f.doc && shipment && (
                <label className="ship-select" title="Which shipment (DSR row) this document belongs to">
                  <span>Shipment</span>
                  <select value={shipment.key} onChange={(e) => onGroup(f.id, e.target.value)}>
                    {shipments.map((s) => (
                      <option key={s.key} value={s.key}>
                        #{s.no}
                      </option>
                    ))}
                    {shipment.docs.length > 1 && <option value={`solo:${f.id}`}>New shipment</option>}
                  </select>
                </label>
              )}
              <div className="file-actions">
                {f.doc && (
                  <button className="icon-btn" onClick={() => onView(f.doc!)} title="View extracted text" aria-label="View extracted text">
                    <Icon name="eye" />
                  </button>
                )}
                <button className="icon-btn" onClick={() => onRemove(f.id)} title="Remove" aria-label={`Remove ${f.name}`}>
                  <Icon name="x" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
