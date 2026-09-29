import type { ExtractedDoc } from '../types';

export interface Shipment {
  key: string;
  no: number;
  docs: ExtractedDoc[];
}

const isTransport = (d: ExtractedDoc) => d.type === 'awb' || d.type === 'bl';

/** Union-find over documents that share a key; returns doc id -> group root. */
function linkByKeys(docs: ExtractedDoc[]): (id: string) => string {
  const parent = new Map(docs.map((d) => [d.id, d.id]));
  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p === id) return id;
    const r = find(p);
    parent.set(id, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));

  const owner = new Map<string, string>();
  for (const d of docs)
    for (const k of d.keys) {
      const o = owner.get(k);
      if (o) union(d.id, o);
      else owner.set(k, d.id);
    }

  // With a single AWB/BL in the batch, unlinked invoices most likely belong to it.
  const transport = docs.filter(isTransport);
  if (transport.length === 1) {
    const root = find(transport[0].id);
    for (const d of docs) union(d.id, root);
  }
  return find;
}

/**
 * Groups documents into shipments. Documents are linked when they share a key
 * (invoice number referenced on the AWB, AWB/BL number, file-name job prefix).
 * `manual` maps a document id to a group key chosen by the user.
 */
export function groupDocs(docs: ExtractedDoc[], manual: Record<string, string> = {}): Shipment[] {
  const find = linkByKeys(docs);
  // Name each automatic group after its earliest document so keys stay stable as files are added.
  const firstOf = new Map<string, string>();
  for (const d of docs) if (!firstOf.has(find(d.id))) firstOf.set(find(d.id), d.id);

  const byKey = new Map<string, ExtractedDoc[]>();
  for (const d of docs) {
    const key = manual[d.id] ?? 'auto:' + firstOf.get(find(d.id));
    byKey.set(key, [...(byKey.get(key) ?? []), d]);
  }
  return [...byKey.entries()].map(([key, ds], i) => ({ key, no: i + 1, docs: ds }));
}
