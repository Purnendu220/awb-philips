// Debug aid: DUMP=1 npx vitest run tests/dump.test.ts prints the reconstructed lines of each fixture.
import { readdirSync, writeFileSync } from 'node:fs';
import { afterAll, it } from 'vitest';
import { closeOcr, FIXTURES, loadDocText } from './helpers';

afterAll(closeOcr);

it.runIf(process.env.DUMP)('dump fixture lines', async () => {
  const out: string[] = [];
  const log = (s: string) => out.push(s);
  for (const f of readdirSync(FIXTURES).filter((f) => f.endsWith('.pdf'))) {
    const doc = await loadDocText(f);
    log(`\n===== ${f}`);
    for (const p of doc.pages) {
      log(`--- page ${p.lines[0]?.page} (${p.method}${p.confidence ? ' conf ' + p.confidence : ''})`);
      for (const l of p.lines) log(`${l.y.toFixed(0).padStart(4)} ${l.h.toFixed(0).padStart(3)} | ${l.segs.map((s) => `[${s.x0.toFixed(0)}]${s.text}`).join('  ')}`);
    }
  }
  writeFileSync('.scratch/dump.txt', out.join('\n'));
});
