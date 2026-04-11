import { GoogleGenAI, Type } from '@google/genai';
import type { WorkSheet } from 'xlsx';
import * as XLSX from 'xlsx';
import { GEMINI_MODEL } from '@/src/config/gemini';
import type { Program } from '@/src/types';

/** Raw grid from SheetJS (array of rows, each row is an array of cells). */
export type SpreadsheetGrid = unknown[][];

export function worksheetToGrid(worksheet: WorkSheet): SpreadsheetGrid {
  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as SpreadsheetGrid;
}

export interface NormalizedInventoryRow {
  name: string;
  vendor?: string;
  weight?: string;
  category?: string;
  pricing?: string;
  quantity: number;
  program: Program;
}

const MAX_JSON_CHARS = 140_000;
const PREFIX_ROWS = 10;
/** Slightly larger chunks than before to reduce round trips (still under typical context limits). */
const TARGET_BODY_ROWS = 85;
const CHUNK_CONCURRENCY = 4;
const GEMINI_REQUEST_TIMEOUT_MS = 90_000;

const INVENTORY_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    vendor: { type: Type.STRING },
    weight: { type: Type.STRING },
    category: { type: Type.STRING },
    pricing: { type: Type.STRING },
    quantity: { type: Type.NUMBER },
    program: { type: Type.STRING, enum: ['Open-Hours', 'Grocery'] },
  },
  required: ['name', 'quantity', 'program'],
} as const;

function cellStr(c: unknown): string {
  return String(c ?? '').trim();
}

function isRowEmpty(row: unknown[] | undefined): boolean {
  if (!row || !row.length) return true;
  return row.every((c) => cellStr(c) === '');
}

/** Drops trailing blank rows; drops leading fully blank rows (real headers/data follow). */
function trimSpreadsheetGrid(grid: SpreadsheetGrid): SpreadsheetGrid {
  if (!grid.length) return grid;
  let start = 0;
  while (start < grid.length && isRowEmpty(grid[start] as unknown[])) start++;
  let end = grid.length;
  while (end > start && isRowEmpty(grid[end - 1] as unknown[])) end--;
  return start === 0 && end === grid.length ? grid : grid.slice(start, end);
}

function buildSinglePayload(grid: SpreadsheetGrid): string {
  return JSON.stringify({ sheet: grid });
}

function buildChunkPayloads(grid: SpreadsheetGrid): string[] {
  if (grid.length === 0) return [];
  const prefix = grid.slice(0, PREFIX_ROWS);
  const rest = grid.slice(PREFIX_ROWS);
  const payloads: string[] = [];
  for (let i = 0; i < rest.length; i += TARGET_BODY_ROWS) {
    const dataRows = rest.slice(i, i + TARGET_BODY_ROWS);
    payloads.push(
      JSON.stringify({
        prefix,
        dataRows,
        startRowIndex: PREFIX_ROWS + i,
      })
    );
  }
  return payloads;
}

function shouldChunk(grid: SpreadsheetGrid): boolean {
  const s = JSON.stringify(grid);
  return s.length > MAX_JSON_CHARS || grid.length > 90;
}

const CATEGORY_RULES = `If there is no category column or cells are blank, infer a short pantry category from the product name (e.g. Produce, Dairy, Meat, Dry goods, Beverages, Snacks, Frozen, Bakery, Non-food, Other). Never leave category empty when you can infer it from the name.`;

const SINGLE_PROMPT = `You are helping import inventory into Bloom (food bank / pantry style).
The input is JSON with key "sheet": a 2D array of spreadsheet rows (each row is an array of cell strings).
The first row(s) may be titles, merged headers, or blank lines. Find the real column headers and data rows.
Map each logical inventory line to: name, vendor, weight, category, pricing, quantity, program.
- program must be exactly "Open-Hours" or "Grocery"; default to "Grocery" when unclear.
- quantity is a non-negative number; use 1 if missing but the row is clearly one unit line.
- Skip blank rows, section totals, and header-only rows.
- Combine description + product name into name when needed.
- ${CATEGORY_RULES}
Return ONLY a JSON array of objects matching the schema.`;

const CHUNK_PROMPT = `You are helping import inventory into Bloom.
The JSON has: "prefix" (top rows of the sheet for titles/column headers), "dataRows" (rows to convert starting at spreadsheet row startRowIndex), "startRowIndex" (1-based row index in the full sheet for the first dataRows row — use for context only).
Using prefix to understand column meanings, map ONLY dataRows to inventory line items with the same rules as a full-sheet import: name, vendor, weight, category, pricing, quantity, program ("Open-Hours" or "Grocery", default "Grocery"), skip blanks and totals.
- ${CATEGORY_RULES}
Return ONLY a JSON array matching the schema.`;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]!, i);
    }
  }

  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function generateNormalized(
  ai: GoogleGenAI,
  textPrompt: string,
  payloadJson: string
): Promise<NormalizedInventoryRow[]> {
  const call = ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      { text: `${textPrompt}\n\n---\n\n${payloadJson}` },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: INVENTORY_ITEM_SCHEMA,
      },
    },
  });

  const response = await withTimeout(call, GEMINI_REQUEST_TIMEOUT_MS, 'Gemini spreadsheet import');

  const raw = JSON.parse(response.text || '[]') as NormalizedInventoryRow[];
  return raw.map((row) => ({
    ...row,
    quantity: Math.max(0, Number.isFinite(row.quantity) ? row.quantity : 0),
    program: row.program === 'Open-Hours' ? 'Open-Hours' : 'Grocery',
  }));
}

/**
 * Sends spreadsheet grid(s) to Gemini and returns rows aligned with InventoryItem fields.
 * Chunks large sheets by including a fixed prefix for column alignment.
 */
export async function normalizeSpreadsheetWithGemini(
  grid: SpreadsheetGrid,
  apiKey: string
): Promise<NormalizedInventoryRow[]> {
  const trimmed = trimSpreadsheetGrid(grid);
  if (!trimmed.length) return [];

  const ai = new GoogleGenAI({ apiKey });

  if (!shouldChunk(trimmed)) {
    return generateNormalized(ai, SINGLE_PROMPT, buildSinglePayload(trimmed));
  }

  if (trimmed.length <= PREFIX_ROWS) {
    return generateNormalized(ai, SINGLE_PROMPT, buildSinglePayload(trimmed));
  }

  const payloads = buildChunkPayloads(trimmed);
  const parts = await mapWithConcurrency(payloads, CHUNK_CONCURRENCY, (payload) =>
    generateNormalized(ai, CHUNK_PROMPT, payload)
  );
  return parts.flat();
}
