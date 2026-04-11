import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/src/lib/utils';
import { Program } from '@/src/types';
import {
  normalizeSpreadsheetWithGemini,
  worksheetToGrid,
  type NormalizedInventoryRow,
} from '@/src/lib/normalizeSpreadsheetWithGemini';
import { toast } from 'sonner';

function geminiKeyLooksInvalid(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.includes('API_KEY_INVALID') || raw.includes('API key not valid');
}

interface ExcelImportProps {
  onExtracted: (items: any[]) => void;
}

function heuristicMapObjects(rows: Record<string, unknown>[]): NormalizedInventoryRow[] {
  return rows.map((row) => ({
    name: String(
      row.name ?? row.Name ?? row.Item ?? row.Description ?? row.Product ?? 'Unknown Item'
    ),
    vendor: String(row.vendor ?? row.Vendor ?? row.Donor ?? row.Supplier ?? ''),
    weight: String(row.weight ?? row.Weight ?? ''),
    category: String(row.category ?? row.Category ?? ''),
    pricing: String(row.pricing ?? row.Pricing ?? row.Price ?? row['Unit Price'] ?? ''),
    quantity: parseInt(String(row.quantity ?? row.Quantity ?? row.Qty ?? '1'), 10) || 1,
    program: ((row.program ?? row.Program ?? 'Grocery') as Program) === 'Open-Hours'
      ? 'Open-Hours'
      : 'Grocery',
  }));
}

export function ExcelImport({ onExtracted }: ExcelImportProps) {
  const [phase, setPhase] = useState<'idle' | 'reading' | 'organizing'>('idle');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhase('reading');
    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const grid = worksheetToGrid(worksheet);

      let items: NormalizedInventoryRow[];

      if (process.env.GEMINI_API_KEY) {
        setPhase('organizing');
        try {
          items = await normalizeSpreadsheetWithGemini(grid, process.env.GEMINI_API_KEY);
        } catch (err) {
          console.error('Gemini spreadsheet normalization failed:', err);
          if (geminiKeyLooksInvalid(err)) {
            toast.error(
              'Gemini API key is missing, invalid, or expired. Using basic column matching. Set GEMINI_API_KEY in .env and restart the dev server.'
            );
          } else {
            toast.message('AI could not organize this file — using basic column matching instead.');
          }
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
          items = heuristicMapObjects(json);
        }
      } else {
        alert(
          'GEMINI_API_KEY is not set — importing with basic column names only (name, quantity, etc.).'
        );
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
        items = heuristicMapObjects(json);
      }

      onExtracted(items);
    } catch (error) {
      console.error('Excel Import Error:', error);
      alert('Failed to parse Excel/CSV file.');
    } finally {
      setPhase('idle');
      e.target.value = '';
    }
  };

  const isProcessing = phase !== 'idle';

  return (
    <label
      className={cn(
        'w-full py-4 rounded-3xl font-bold text-lg wheat-grass-btn transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm',
        isProcessing && 'opacity-50 cursor-not-allowed pointer-events-none'
      )}
    >
      <input
        type="file"
        className="hidden"
        onChange={handleFile}
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
      />
      {isProcessing ? (
        <>
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>
            {phase === 'reading' ? 'Reading file…' : 'Organizing with AI…'}
          </span>
        </>
      ) : (
        <>
          <FileSpreadsheet className="w-6 h-6" />
          Import Excel / CSV
        </>
      )}
    </label>
  );
}
