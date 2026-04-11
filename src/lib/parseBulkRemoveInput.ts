/**
 * Parse bulk stock removal lines from paste (plain text, CSV, or Excel TSV paste).
 */

export type BulkRemoveLine = { name: string; subtract: number };

function parseCommaLine(line: string): BulkRemoveLine | null {
  const lastComma = line.lastIndexOf(',');
  if (lastComma > 0) {
    const maybeQty = line.slice(lastComma + 1).trim();
    const n = Math.floor(Number(maybeQty));
    if (Number.isFinite(n) && n >= 0 && maybeQty !== '') {
      return {
        name: line.slice(0, lastComma).trim(),
        subtract: Math.max(0, n),
      };
    }
  }
  const name = line.trim();
  return name ? { name, subtract: 1 } : null;
}

function parseTsvLine(line: string): BulkRemoveLine | null {
  const parts = line.split('\t').map((p) => p.replace(/^"|"$/g, '').trim());
  if (parts.length === 0 || !parts[0]) return null;
  const name = parts[0];
  if (parts.length < 2) return { name, subtract: 1 };
  const n = Math.floor(Number(parts[1].replace(/,/g, '')));
  if (Number.isFinite(n) && n >= 0) return { name, subtract: n };
  return { name, subtract: 1 };
}

function parseDelimitedLine(line: string, delim: ';' | '|'): BulkRemoveLine | null {
  const parts = line.split(delim).map((p) => p.trim());
  if (!parts[0]) return null;
  const name = parts[0];
  if (parts.length < 2) return { name, subtract: 1 };
  const n = Math.floor(Number(parts[1].replace(/,/g, '')));
  if (Number.isFinite(n) && n >= 0) return { name, subtract: n };
  return { name, subtract: 1 };
}

/** Parse multiline paste: supports TSV (Excel), comma "name, qty", semicolon, pipe. */
export function parseBulkRemoveInput(raw: string): BulkRemoveLine[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: BulkRemoveLine[] = [];

  for (const line of lines) {
    let row: BulkRemoveLine | null = null;
    if (line.includes('\t')) {
      row = parseTsvLine(line);
    } else if (line.includes(';') && !/^[^,]*,\s*\d/.test(line)) {
      row = parseDelimitedLine(line, ';');
    } else if (line.includes('|')) {
      row = parseDelimitedLine(line, '|');
    } else {
      row = parseCommaLine(line);
    }
    if (row && row.name) out.push(row);
  }
  return out;
}

/** Map spreadsheet JSON rows (from XLSX) to removal lines. */
export function spreadsheetRowsToSubtract(rows: Record<string, unknown>[]): BulkRemoveLine[] {
  const out: BulkRemoveLine[] = [];
  for (const row of rows) {
    const name = String(
      row.name ??
        row.Name ??
        row.Item ??
        row.Description ??
        row.Product ??
        row.item ??
        ''
    ).trim();
    if (!name) continue;
    const rawQty =
      row.quantity ??
      row.Quantity ??
      row.Qty ??
      row.Subtract ??
      row['Qty to remove'] ??
      row['Qty out'] ??
      row.Removed ??
      row.remove ??
      row.Deduct ??
      1;
    const n = Math.floor(Number(String(rawQty).replace(/,/g, '')));
    const subtract = Number.isFinite(n) && n >= 0 ? n : 1;
    if (subtract === 0) continue;
    out.push({ name, subtract });
  }
  return out;
}
