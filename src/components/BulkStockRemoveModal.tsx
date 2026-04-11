import { useState, useMemo, useRef } from 'react';
import Fuse from 'fuse.js';
import * as XLSX from 'xlsx';
import { X, MinusCircle, FileSpreadsheet, Mic, MicOff, Loader2, ClipboardPaste } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { InventoryItem } from '@/src/types';
import { toast } from 'sonner';
import { parseBulkRemoveInput, spreadsheetRowsToSubtract } from '@/src/lib/parseBulkRemoveInput';
import { GEMINI_MODEL } from '@/src/config/gemini';
import { cn } from '@/src/lib/utils';

type Tab = 'paste' | 'file' | 'voice';

interface BulkStockRemoveModalProps {
  inventory: InventoryItem[];
  onClose: () => void;
  onApply: (ops: { id: string; subtract: number }[]) => void | Promise<void>;
}

function buildOpsFromLines(
  lines: { name: string; subtract: number }[],
  inventory: InventoryItem[],
  fuse: Fuse<InventoryItem>
): { ops: { id: string; subtract: number }[]; missed: string[] } {
  const remaining = new Map(inventory.map((i) => [i.id, i.quantity]));
  const ops: { id: string; subtract: number }[] = [];
  const missed: string[] = [];

  for (const { name, subtract } of lines) {
    if (!name) continue;
    const exact = inventory.find((i) => i.name.toLowerCase() === name.toLowerCase());
    const match =
      exact || (fuse.search(name, { limit: 1 })[0]?.item as InventoryItem | undefined);
    if (!match) {
      missed.push(name);
      continue;
    }
    const rem = remaining.get(match.id) ?? 0;
    const sub = Math.min(subtract, rem);
    if (sub > 0) {
      ops.push({ id: match.id, subtract: sub });
      remaining.set(match.id, rem - sub);
    }
  }
  return { ops, missed };
}

export function BulkStockRemoveModal({ inventory, onClose, onApply }: BulkStockRemoveModalProps) {
  const [tab, setTab] = useState<Tab>('paste');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [filePhase, setFilePhase] = useState<'idle' | 'reading'>('idle');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const latestTranscript = useRef('');

  const fuse = useMemo(
    () =>
      new Fuse(inventory, {
        keys: ['name', 'vendor', 'category'],
        threshold: 0.35,
      }),
    [inventory]
  );

  const applyParsed = async (lines: { name: string; subtract: number }[]) => {
    if (lines.length === 0) {
      toast.error('Nothing to process — add names (and quantities if needed).');
      return;
    }
    const { ops, missed } = buildOpsFromLines(lines, inventory, fuse);
    if (ops.length === 0) {
      toast.error('No matching inventory rows (check spelling or fuzzy match).');
      return;
    }
    setBusy(true);
    try {
      await onApply(ops);
      if (missed.length > 0) {
        toast.warning(`No match: ${missed.slice(0, 6).join(', ')}${missed.length > 6 ? '…' : ''}`);
      } else {
        toast.success(`Removed stock on ${ops.length} update(s).`);
      }
      onClose();
    } catch {
      /* caller toasts */
    } finally {
      setBusy(false);
    }
  };

  const runPaste = () => void applyParsed(parseBulkRemoveInput(text));

  const handleExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilePhase('reading');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const lines = spreadsheetRowsToSubtract(json);
      if (lines.length === 0) {
        toast.error('No rows found — use columns like Item + Quantity (or Qty to remove).');
        return;
      }
      await applyParsed(lines);
    } catch (err) {
      console.error(err);
      toast.error('Could not read that spreadsheet.');
    } finally {
      setFilePhase('idle');
      e.target.value = '';
    }
  };

  const processVoiceRemovals = async (spoken: string) => {
    if (!spoken.trim()) return;
    setBusy(true);
    try {
      if (!process.env.GEMINI_API_KEY) {
        toast.error('GEMINI_API_KEY is not set.');
        return;
      }
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Pantry volunteer said what to remove from stock: "${spoken}".
Return each removal as one entry: item name and how many units to subtract (positive integer).
Examples: "take out 3 cases of rice" -> one row; "remove 2 soup and 5 pasta" -> two rows.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
              },
              required: ['name', 'quantity'],
            },
          },
        },
      });
      const arr = JSON.parse(response.text || '[]') as { name: string; quantity: number }[];
      const lines = arr
        .filter((r) => r.name && Number.isFinite(r.quantity))
        .map((r) => ({
          name: String(r.name).trim(),
          subtract: Math.max(0, Math.floor(r.quantity)),
        }))
        .filter((r) => r.subtract > 0);
      setVoiceTranscript('');
      await applyParsed(lines);
    } catch (err) {
      console.error(err);
      toast.error('Could not understand removals — try paste or Excel.');
    } finally {
      setBusy(false);
    }
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }
    recognitionRef.current = new SR();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.onstart = () => setIsListening(true);
    recognitionRef.current.onend = () => {
      setIsListening(false);
      if (latestTranscript.current) {
        void processVoiceRemovals(latestTranscript.current);
        latestTranscript.current = '';
      }
    };
    recognitionRef.current.onresult = (ev: any) => {
      const cur = ev.results[ev.results.length - 1][0].transcript;
      setVoiceTranscript(cur);
      latestTranscript.current = cur;
    };
    recognitionRef.current.start();
  };

  const stopVoice = () => recognitionRef.current?.stop();

  const tabs: { id: Tab; label: string; icon: typeof ClipboardPaste }[] = [
    { id: 'paste', label: 'Paste / type', icon: ClipboardPaste },
    { id: 'file', label: 'Excel file', icon: FileSpreadsheet },
    { id: 'voice', label: 'Speak removals', icon: Mic },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2">
            <MinusCircle className="h-6 w-6 text-rose-600" />
            <h3 className="text-lg font-bold text-slate-900">Bulk stock out</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                tab === t.id
                  ? 'bg-maroon-50 text-maroon-800 ring-1 ring-maroon-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'paste' && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-slate-600">
              Paste from Excel (tab-separated), type one item per line, or use{' '}
              <code className="rounded bg-slate-100 px-1 text-maroon-800">name, 5</code> for quantity. Semicolon and
              pipe also work.
            </p>
            <textarea
              className="min-h-[200px] w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-maroon-300 focus:outline-none focus:ring-2 focus:ring-maroon-200/50"
              placeholder={'Rice\t10\n"Canned beans", 6\nPasta; 2'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runPaste}
                disabled={busy}
                className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {busy ? 'Applying…' : 'Apply removals'}
              </button>
            </div>
          </div>
        )}

        {tab === 'file' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              First sheet: include an item column (Name / Item / Description) and a quantity column (Quantity / Qty /
              Subtract / Removed).
            </p>
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition-colors hover:border-maroon-300',
                filePhase !== 'idle' && 'pointer-events-none opacity-50'
              )}
            >
              <FileSpreadsheet className="mb-2 h-10 w-10 text-maroon-600" />
              <span className="font-semibold text-slate-800">
                {filePhase === 'reading' ? 'Reading…' : 'Choose .xlsx, .xls, or .csv'}
              </span>
              <span className="mt-1 text-xs text-slate-500">Same style as inventory import — one row per deduction</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => void handleExcelFile(e)}
                disabled={busy || filePhase !== 'idle'}
              />
            </label>
          </div>
        )}

        {tab === 'voice' && (
          <div className="space-y-4 text-center">
            <p className="text-xs text-slate-600">
              Tap the mic and say what to pull from stock, e.g. &quot;Remove 4 boxes of cereal and 2 cases of milk.&quot;
            </p>
            <button
              type="button"
              onClick={isListening ? stopVoice : startVoice}
              disabled={busy}
              className={cn(
                'mx-auto flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition-transform',
                isListening ? 'animate-pulse bg-rose-600' : 'wheat-grass-btn hover:scale-105',
                busy && 'cursor-not-allowed opacity-50'
              )}
            >
              {busy ? (
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              ) : isListening ? (
                <MicOff className="h-8 w-8 text-white" />
              ) : (
                <Mic className="h-8 w-8 text-white" />
              )}
            </button>
            {voiceTranscript && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm text-slate-700">
                &quot;{voiceTranscript}&quot;
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
