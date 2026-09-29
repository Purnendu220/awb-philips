# DSR Builder

Upload shipment PDFs (Air Waybill, Commercial Invoice, Bill of Lading, Packing List), review the extracted data, and download it as an XLSX in the `DSR_FORMAT` layout.

Live: https://dsr-builder-un3q.web.app

## How it works

Everything runs in the browser. PDFs are never uploaded to a server.

1. **Read**: pdf.js reads the text layer. Pages without text (scans) are rendered and OCR'd with Tesseract. The worker, WASM core and English model are self-hosted under `/ocr`.
2. **Classify and parse** (`src/lib/parse`):
   - `awb.ts` finds the standard IATA box labels ("Shipper's Name and Address", "Airport of Destination", ...) and reads the text inside each box, so it works for any forwarder's AWB.
   - `invoice.ts` uses label/value lookups that tolerate OCR noise, a line-item table detector, and cross-checks the amount against the line totals.
   - `bl.ts` is a label-driven Bill of Lading parser. It has not been tested on real BLs yet.
3. **Group**: documents become shipments (`src/lib/dsr/group.ts`) when they share an invoice number, an AWB/BL number, or a file-name job prefix. Users can reassign a document in the Files panel.
4. **Map** each shipment to one DSR row (`src/lib/dsr/mapping.ts`). Every cell records its source: AWB, invoice, derived or default. Edits in the table override the extracted values.
5. **Export** (`src/lib/export/xlsx.ts`) writes these sheets:
   - `DSR`: same headers, fills, widths and number formats as the template, with live formulas for AssessValue, TAT and transit time.
   - `Extracted Details`
   - `Line Items`
   - `HOLIDAY LIST`

## Rules taken from the existing DSR

- **Shipper:** the AWB shipper box, upper-cased.
- **Item description:** the highest-value invoice line.
- **BL DATE:** the AWB execution date.
- **ETA:** the date of the last requested flight + 1 day. This is an estimate and is marked as derived.
- **IMPORT ADDRESS:** `PHILIPS, GHARI` for the Gurugram Pataudi Road warehouse. Otherwise `PHILIPS, <city>`.
- **MODALITY:** from the shipper and product. Ultrasound/ATL gives US, IGT gives IGTD, RS gives S&RC, imaging systems give IS, anything else gives PCMS.
- **END CUSTOMER:** filled only for IS shipments.
- **Target Time:** 2 by default.
- **Defaults bar:** Status, CHA, Exc. Rate, Planner and Target Time apply to every row. They are remembered in the browser.

## Development

```bash
npm install        # also copies OCR assets into public/ocr
npm run dev        # http://localhost:5173
npm test           # parser + DSR tests on tests/fixtures (runs real pdf.js + OCR in Node)
npm run build
node scripts/e2e.mjs http://localhost:4173/   # browser test against `npm run preview` (needs Chrome)
```

Test expectations for the sample shipment come from row 774 of `DSR_FORMAT-2026-27.xlsx`, where the same shipment was entered by hand.

To add a new document layout: drop the PDF into `tests/fixtures`, run `DUMP=1 npx vitest run tests/dump.test.ts`, and read `.scratch/dump.txt` to see the reconstructed lines. Then extend the parser and add assertions.

## Deploy

```bash
npm run deploy     # build + firebase deploy --only hosting (project: dsr-builder-un3q)
```
