import { useEffect, useRef, useState } from 'react';
import { COLUMNS, type DsrColumn } from '../lib/dsr/columns';
import type { Shipment } from '../lib/dsr/group';
import type { Cell, CellValue, Defaults, DsrRow, Source } from '../lib/dsr/mapping';
import { fmtDate, fmtNum } from '../lib/format';
import { parseDate, parseNumber } from '../lib/parse/util';
import { Icon } from './Icon';

interface Props {
  rows: DsrRow[];
  shipments: Shipment[];
  defaults: Defaults;
  onDefaults: (d: Defaults) => void;
  /** `undefined` resets the cell to the extracted value. */
  onEdit: (shipmentKey: string, col: string, v: CellValue | undefined) => void;
}

const SOURCE_LABEL: Record<Source, string> = {
  awb: 'From Air Waybill',
  invoice: 'From invoice',
  bl: 'From Bill of Lading',
  derived: 'Derived',
  default: 'Default value',
  manual: 'Edited',
};

const LEGEND: [Source, string][] = [
  ['awb', 'Air Waybill'],
  ['invoice', 'Invoice'],
  ['bl', 'Bill of Lading'],
  ['derived', 'Derived / estimated'],
  ['default', 'Default'],
  ['manual', 'Edited'],
];

function display(col: DsrColumn, v: CellValue): string {
  if (v === null || v === '') return '';
  if (col.type === 'date' && typeof v === 'string') return fmtDate(v);
  if (typeof v === 'number') {
    if (col.type === 'money' || col.key === 'assessValue') return fmtNum(v, 2);
    if (col.type === 'id' || col.key === 'srNo') return String(v);
    return fmtNum(v);
  }
  return String(v);
}

function parseInput(col: DsrColumn, raw: string): CellValue {
  const s = raw.trim();
  if (!s) return null;
  if (col.type === 'date') return parseDate(s, 'DMY') ?? s;
  if (col.type === 'number' || col.type === 'money') return parseNumber(s) ?? s;
  return s;
}

const isNumeric = (c: DsrColumn) => c.type === 'number' || c.type === 'money' || c.type === 'formula';

export function DsrTable({ rows, shipments, defaults, onDefaults, onEdit }: Props) {
  const [editing, setEditing] = useState<{ r: number; c: string } | null>(null);
  const [hideEmpty, setHideEmpty] = useState(false);

  const cols = hideEmpty ? COLUMNS.filter((c) => c.key === 'srNo' || rows.some((r) => r[c.key].v !== null)) : COLUMNS;
  const editable = cols.filter((c) => c.type !== 'formula' && c.key !== 'srNo');

  const moveNext = (r: number, c: string, back: boolean) => {
    const i = editable.findIndex((x) => x.key === c) + (back ? -1 : 1);
    if (i >= 0 && i < editable.length) setEditing({ r, c: editable[i].key });
    else setEditing(null);
  };

  const setDefault = (k: keyof Defaults, v: string) => onDefaults({ ...defaults, [k]: v });

  return (
    <div className="dsr-wrap">
      <div className="toolbar">
        <div className="defaults" aria-label="Values applied to every row">
          <label>
            <span>Status</span>
            <select value={defaults.status} onChange={(e) => setDefault('status', e.target.value)}>
              <option value="INTRANSIT">INTRANSIT</option>
              <option value="Cleared">Cleared</option>
              <option value="">(blank)</option>
            </select>
          </label>
          <label>
            <span>CHA</span>
            <select value={defaults.cha} onChange={(e) => setDefault('cha', e.target.value)}>
              <option value="">(blank)</option>
              {COLUMNS.find((c) => c.key === 'cha')!.options!.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Exc. Rate</span>
            <input className="num" inputMode="decimal" placeholder="e.g. 92.50" value={defaults.excRate} onChange={(e) => setDefault('excRate', e.target.value)} />
          </label>
          <label>
            <span>Planner</span>
            <input value={defaults.planner} placeholder="Name" onChange={(e) => setDefault('planner', e.target.value)} />
          </label>
          <label>
            <span>Target Time</span>
            <input className="num short" inputMode="numeric" value={defaults.targetTime} onChange={(e) => setDefault('targetTime', e.target.value)} />
          </label>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
          <span>Hide empty columns</span>
        </label>
      </div>

      <div className="legend">
        {LEGEND.map(([s, label]) => (
          <span key={s} className={`legend-item src-${s}`}>
            <i /> {label}
          </span>
        ))}
        <span className="muted legend-hint">Click a cell to edit. Hover for its source.</span>
      </div>

      <div className="dsr-scroll">
        <table className="dsr">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={`h-${c.fill} ${isNumeric(c) ? 'num' : ''}`} style={{ minWidth: Math.max(64, c.width * 6.2) }}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={shipments[ri].key}>
                {cols.map((c) => (
                  <DsrCell
                    key={c.key}
                    col={c}
                    cell={row[c.key]}
                    editing={editing?.r === ri && editing.c === c.key}
                    onStart={() => c.type !== 'formula' && c.key !== 'srNo' && setEditing({ r: ri, c: c.key })}
                    onCommit={(change, nav) => {
                      if (change) onEdit(shipments[ri].key, c.key, change.v);
                      if (nav) moveNext(ri, c.key, nav === 'back');
                      else setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface CellProps {
  col: DsrColumn;
  cell: Cell;
  editing: boolean;
  onStart: () => void;
  /** `change` is null when the value was not modified; `change.v === undefined` restores the extracted value. */
  onCommit: (change: { v: CellValue | undefined } | null, nav?: 'next' | 'back') => void;
  onCancel: () => void;
}

function DsrCell({ col, cell, editing, onStart, onCommit, onCancel }: CellProps) {
  const text = display(col, cell.v);
  const tip = [cell.src && SOURCE_LABEL[cell.src], cell.note].filter(Boolean).join(': ');
  const cls = `${cell.src ? `src-${cell.src}` : ''} ${isNumeric(col) ? 'num' : ''} ${col.type === 'formula' ? 'formula' : ''}`;

  if (editing) return <td className={`${cls} editing`}><Editor col={col} cell={cell} onCommit={onCommit} onCancel={onCancel} /></td>;
  return (
    <td className={cls} title={tip || undefined} onClick={onStart}>
      {text}
    </td>
  );
}

function Editor({ col, cell, onCommit, onCancel }: Pick<CellProps, 'col' | 'cell' | 'onCommit' | 'onCancel'>) {
  const initial = cell.v === null ? '' : String(cell.v);
  const [val, setVal] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select?.();
  }, []);

  const commit = (nav?: 'next' | 'back') => {
    if (done.current) return;
    done.current = true;
    onCommit(val === initial ? null : { v: parseInput(col, val) }, nav);
  };
  const listId = col.options ? `opts-${col.key}` : undefined;

  return (
    <div className="editor">
      <input
        ref={ref}
        type={col.type === 'date' ? 'date' : 'text'}
        inputMode={col.type === 'number' || col.type === 'money' ? 'decimal' : undefined}
        list={listId}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Tab') {
            e.preventDefault();
            commit(e.shiftKey ? 'back' : 'next');
          } else if (e.key === 'Escape') {
            done.current = true;
            onCancel();
          }
        }}
        aria-label={col.header}
      />
      {listId && (
        <datalist id={listId}>
          {col.options!.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      {cell.src === 'manual' && (
        <button
          className="icon-btn tiny"
          title="Undo edit (restore extracted value)"
          aria-label="Undo edit"
          onMouseDown={(e) => {
            e.preventDefault();
            done.current = true;
            onCommit({ v: undefined });
          }}
        >
          <Icon name="reset" size={13} />
        </button>
      )}
    </div>
  );
}
