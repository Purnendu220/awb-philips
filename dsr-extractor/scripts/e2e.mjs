// End-to-end check in a real browser: node scripts/e2e.mjs [url]
// Uploads the fixture PDFs, waits for extraction/OCR, checks the DSR table and downloads the XLSX.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:4173/';
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync);
const fixtures = join(import.meta.dirname, '..', 'tests', 'fixtures');
const out = join(import.meta.dirname, '..', '.scratch', 'e2e');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url);
await page.screenshot({ path: join(out, '1-empty.png') });
const t0 = Date.now();
await page.setInputFiles('input[type=file]', readdirSync(fixtures).filter((f) => f.endsWith('.pdf')).map((f) => join(fixtures, f)));
await page.waitForFunction(() => document.querySelectorAll('.file-row.done, .file-row.error').length === 2, null, { timeout: 180000 });
console.log(`processed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await page.screenshot({ path: join(out, '2-dsr.png'), fullPage: true });

const table = await page.$$eval('table.dsr', ([t]) => {
  const heads = [...t.querySelectorAll('th')].map((th) => th.textContent);
  return [...t.querySelectorAll('tbody tr')].map((tr) => Object.fromEntries([...tr.children].map((td, i) => [heads[i], td.textContent])).valueOf());
});
console.log(JSON.stringify(table[0], null, 1));

// Edit a cell: set exchange rate default and CHA
await page.fill('.defaults input[placeholder="e.g. 92.50"]', '92.5');
await page.locator('table.dsr tbody td').nth(3).click();
await page.keyboard.type('CARGOMEN');
await page.keyboard.press('Enter');
const edited = await page.$$eval('table.dsr tbody tr:first-child td', (tds) => [tds[3].textContent, tds[3].className, tds[11].textContent]);
console.log('edited CHA / AssessValue:', edited);

await page.click('button.tab:has-text("Extracted Data")');
await page.screenshot({ path: join(out, '3-details.png'), fullPage: true });
await page.click('button.tab:has-text("Line Items")');
await page.screenshot({ path: join(out, '4-items.png'), fullPage: true });

const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download XLSX")')]);
const file = join(out, download.suggestedFilename());
await download.saveAs(file);
console.log('downloaded', file);

await page.setViewportSize({ width: 390, height: 844 });
await page.click('button.tab:has-text("DSR Table")');
await page.screenshot({ path: join(out, '5-mobile.png'), fullPage: true });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
