import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DsrTable } from './components/DsrTable';
import { ExtractedView } from './components/ExtractedView';
import { FilesPanel, type FileEntry } from './components/FilesPanel';
import { Icon } from './components/Icon';
import { LineItems } from './components/LineItems';
import { TextModal } from './components/TextModal';
import { UploadZone } from './components/UploadZone';
import { groupDocs } from './lib/dsr/group';
import { buildRow, computeFormulas, DEFAULTS, type CellValue, type Defaults, type DsrRow } from './lib/dsr/mapping';
import { fmtNum } from './lib/format';
import { parseDocument } from './lib/parse';
import type { ExtractedDoc } from './lib/types';

type Tab = 'dsr' | 'details' | 'items';
type Overrides = Record<string, Record<string, CellValue>>;

const DEFAULTS_KEY = 'dsr-builder.defaults';

function loadDefaults(): Defaults {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function errorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'PasswordException') return 'This PDF is password-protected.';
  if (name === 'InvalidPDFException') return 'Not a valid PDF file.';
  return e instanceof Error ? e.message : String(e);
}

let seq = 0;

export default function App() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [manualGroups, setManualGroups] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Overrides>({});
  const [defaults, setDefaults] = useState<Defaults>(loadDefaults);
  const [tab, setTab] = useState<Tab>('dsr');
  const [viewing, setViewing] = useState<ExtractedDoc | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const busy = useRef(false);

  const update = useCallback((id: string, patch: Partial<FileEntry>) => {
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  // Process queued files one at a time (OCR shares a single worker).
  useEffect(() => {
    if (busy.current) return;
    const next = files.find((f) => f.status === 'queued');
    if (!next) return;
    busy.current = true;
    update(next.id, { status: 'processing', statusText: 'Opening PDF', progress: 0 });
    (async () => {
      try {
        const { extractFile } = await import('./lib/pdf/browser');
        const text = await extractFile(next.file, (statusText, progress) => update(next.id, { statusText, progress }));
        const doc = parseDocument(next.id, next.name, text);
        busy.current = false;
        update(next.id, { status: 'done', doc, progress: 1, statusText: 'Done' });
      } catch (e) {
        console.error(e);
        busy.current = false;
        update(next.id, { status: 'error', error: errorMessage(e) });
      }
    })();
  }, [files, update]);

  useEffect(() => {
    try {
      localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
    } catch {
      /* storage unavailable: defaults just won't be remembered */
    }
  }, [defaults]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const addFiles = (list: File[]) => {
    const pdfs = list.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    const skipped = list.length - pdfs.length;
    const fresh = pdfs.filter((f) => !files.some((x) => x.name === f.name && x.size === f.size));
    const dupes = pdfs.length - fresh.length;
    if (skipped || dupes)
      setNotice([skipped && `${skipped} non-PDF file(s) skipped`, dupes && `${dupes} duplicate file(s) skipped`].filter(Boolean).join(' - '));
    if (!fresh.length) return;
    setFiles((fs) => [
      ...fs,
      ...fresh.map<FileEntry>((file) => ({ id: `f${++seq}`, file, name: file.name, size: file.size, status: 'queued', progress: 0, statusText: 'Waiting' })),
    ]);
  };

  const removeFile = (id: string) => {
    setFiles((fs) => fs.filter((f) => f.id !== id));
    setManualGroups(({ [id]: _, ...rest }) => rest);
  };

  const clearAll = () => {
    setFiles([]);
    setManualGroups({});
    setOverrides({});
  };

  const docs = useMemo(() => files.filter((f) => f.doc).map((f) => f.doc!), [files]);
  const shipments = useMemo(() => groupDocs(docs, manualGroups), [docs, manualGroups]);
  const rows: DsrRow[] = useMemo(
    () =>
      shipments.map((s) => {
        const row = buildRow(s, defaults);
        for (const [k, v] of Object.entries(overrides[s.key] ?? {})) row[k] = { v, src: 'manual', note: 'Edited manually' };
        return computeFormulas(row);
      }),
    [shipments, defaults, overrides],
  );

  const editCell = (shipmentKey: string, col: string, v: CellValue | undefined) =>
    setOverrides((o) => {
      const cur = { ...o[shipmentKey] };
      if (v === undefined) delete cur[col];
      else cur[col] = v;
      return { ...o, [shipmentKey]: cur };
    });

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const { downloadXlsx } = await import('./lib/export/xlsx');
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadXlsx(rows, shipments, `DSR_${stamp}.xlsx`);
    } catch (e) {
      setNotice('Export failed: ' + errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const pending = files.some((f) => f.status === 'queued' || f.status === 'processing');
  const totals = useMemo(() => {
    const byCur = new Map<string, number>();
    let gross = 0;
    for (const r of rows) {
      const amt = r.invAmt.v;
      if (typeof amt === 'number') byCur.set(String(r.currency.v ?? ''), (byCur.get(String(r.currency.v ?? '')) ?? 0) + amt);
      if (typeof r.grossWt.v === 'number') gross += r.grossWt.v;
    }
    return { byCur: [...byCur.entries()], gross };
  }, [rows]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="sheet" />
          </span>
          <div>
            <div className="brand-name">DSR Builder</div>
            <div className="brand-sub">Air Waybill &amp; Invoice PDF to DSR sheet</div>
          </div>
        </div>
        <div className="topbar-actions">
          {files.length > 0 && (
            <button className="btn btn-ghost-light" onClick={clearAll} disabled={pending}>
              <Icon name="trash" /> <span className="btn-label">Clear all</span>
            </button>
          )}
          <button className="btn btn-excel" onClick={exportXlsx} disabled={!rows.length || pending || exporting}>
            <Icon name="download" /> {exporting ? 'Preparing...' : <>Download<span className="btn-label">&nbsp;XLSX</span></>}
          </button>
        </div>
      </header>

      <main className="content">
        <section className="grid-top">
          <UploadZone onFiles={addFiles} compact={files.length > 0} />
          {files.length > 0 && (
            <FilesPanel files={files} shipments={shipments} manualGroups={manualGroups} onGroup={(id, key) => setManualGroups((m) => ({ ...m, [id]: key }))} onRemove={removeFile} onView={setViewing} />
          )}
        </section>

        {notice && (
          <div className="notice" role="status">
            <Icon name="info" /> {notice}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <section className="kpis">
              <div className="kpi">
                <div className="kpi-label">Documents</div>
                <div className="kpi-value">{docs.length}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Shipments</div>
                <div className="kpi-value">{shipments.length}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Invoice value</div>
                <div className="kpi-value">
                  {totals.byCur.length ? totals.byCur.map(([c, v]) => `${c} ${fmtNum(v, 2)}`).join(' + ') : '-'}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Gross weight</div>
                <div className="kpi-value">{totals.gross ? `${fmtNum(totals.gross)} kg` : '-'}</div>
              </div>
            </section>

            <section className="card">
              <div className="tabs" role="tablist">
                {(
                  [
                    ['dsr', 'DSR Table'],
                    ['details', 'Extracted Data'],
                    ['items', 'Line Items'],
                  ] as [Tab, string][]
                ).map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {tab === 'dsr' && (
                <DsrTable rows={rows} shipments={shipments} defaults={defaults} onDefaults={setDefaults} onEdit={editCell} />
              )}
              {tab === 'details' && <ExtractedView shipments={shipments} onView={setViewing} />}
              {tab === 'items' && <LineItems shipments={shipments} />}
            </section>
          </>
        )}
      </main>

      {viewing && <TextModal doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
