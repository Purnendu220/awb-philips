/** A positioned run of text, in PDF points with a top-left origin. */
export interface TextItem {
  str: string;
  x: number;
  /** Top edge of the glyph box. */
  y: number;
  w: number;
  h: number;
}

/** Contiguous text on a line; a wide horizontal gap starts a new segment. */
export interface Segment {
  text: string;
  x0: number;
  x1: number;
}

export interface Line {
  page: number;
  y: number;
  h: number;
  segs: Segment[];
  /** Segments joined with three spaces (keeps column breaks visible to regexes). */
  text: string;
}

export interface PageText {
  width: number;
  height: number;
  method: 'text' | 'ocr';
  items: TextItem[];
  lines: Line[];
  /** OCR mean confidence (0-100); undefined for text pages. */
  confidence?: number;
}

export interface DocText {
  pages: PageText[];
}

export type DocType = 'awb' | 'invoice' | 'bl' | 'packing' | 'unknown';

export interface LineItem {
  hsCode?: string;
  partNo?: string;
  serialNo?: string;
  description?: string;
  qty?: number;
  unitPrice?: number;
  total?: number;
}

export interface Party {
  name?: string;
  address?: string[];
}

export interface FlightLeg {
  flight: string;
  day: number;
}

export interface AwbData {
  hawb?: string;
  mawb?: string;
  shipper: Party;
  consignee: Party;
  agent: Party;
  agentIata?: string;
  departure?: string;
  destination?: string;
  routing: { to: string; by?: string }[];
  flights: FlightLeg[];
  currency?: string;
  handling?: string;
  incoterm?: string;
  references: string[];
  pieces?: number;
  grossWeight?: number;
  weightUnit?: 'KG' | 'LB';
  chargeableWeight?: number;
  goods?: string;
  goodsDetails: string[];
  dimensions?: string;
  executedDate?: string;
  executedPlace?: string;
}

export interface InvoiceData {
  invoiceNo?: string;
  invoiceDate?: string;
  amount?: number;
  currency?: string;
  orderNo?: string;
  orderDate?: string;
  customerPo?: string;
  shipDate?: string;
  shipVia?: string;
  shippingTerms?: string;
  incoterm?: string;
  exporter: Party;
  billTo: Party;
  shipTo: Party;
  endUser?: string;
  countryOfOrigin?: string;
  items: LineItem[];
  packages: { gross?: number; net?: number; dims?: string }[];
  grossWeight?: number;
  netWeight?: number;
}

export interface BlData {
  blNo?: string;
  blDate?: string;
  shipper: Party;
  consignee: Party;
  carrier?: string;
  vessel?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  containers: { no: string; size?: '20' | '40' }[];
  lcl?: boolean;
  packages?: number;
  grossWeight?: number;
  goods?: string;
}

export interface ExtractedDoc {
  id: string;
  fileName: string;
  type: DocType;
  pageCount: number;
  method: 'text' | 'ocr' | 'mixed';
  ocrConfidence?: number;
  awb?: AwbData;
  invoice?: InvoiceData;
  bl?: BlData;
  /** Keys used to group documents of the same shipment. */
  keys: string[];
  rawText: string;
  warnings: string[];
}
