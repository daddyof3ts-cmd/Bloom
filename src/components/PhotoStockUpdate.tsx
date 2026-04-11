import { useState, useEffect } from 'react';
import { Camera, Loader2, Plus, Minus } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { GEMINI_MODEL } from '@/src/config/gemini';
import { cn } from '@/src/lib/utils';
import { GlassCard } from './GlassCard';
import { InventoryItem } from '@/src/types';
import { toast } from 'sonner';

interface PhotoStockUpdateProps {
  onUpdate: (data: { name: string; quantityChange: number; itemMatch?: InventoryItem }) => void;
  inventory: InventoryItem[];
  /** When set, hides Restock/Consume toggle and only allows that mode (for Stock in vs Stock out sections). */
  fixedMode?: 'RESTOCK' | 'CONSUME';
}

export function PhotoStockUpdate({ onUpdate, inventory, fixedMode }: PhotoStockUpdateProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [internalMode, setInternalMode] = useState<'RESTOCK' | 'CONSUME'>('RESTOCK');
  const mode = fixedMode ?? internalMode;

  useEffect(() => {
    if (fixedMode) setInternalMode(fixedMode);
  }, [fixedMode]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!process.env.GEMINI_API_KEY) {
      toast.error('GEMINI_API_KEY is not set.');
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      await processImage(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (base64: string, mimeType: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

      const invContext = inventory.map((i) => `${i.name} (ID: ${i.id})`).join(', ');

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            inlineData: {
              data: base64,
              mimeType: mimeType,
            },
          },
          {
            text: `Identify the main product. Count its exact quantity based on visible cases or items.
            Inventory context: [${invContext}]. If it clearly matches an inventory item, use that name/ID, otherwise provide a clear generic name.
            Return JSON with: name (string), quantityCounted (number).`,
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              quantityCounted: { type: Type.NUMBER },
            },
            required: ['name', 'quantityCounted'],
          },
        },
      });

      const result = JSON.parse(response.text || '{}');
      if (result.name && result.quantityCounted !== undefined) {
        const count = result.quantityCounted || 1;
        const exactMatch = inventory.find(
          (i) => i.name.toLowerCase() === result.name.toLowerCase() || i.id === result.name
        );
        onUpdate({
          name: result.name,
          quantityChange: mode === 'RESTOCK' ? count : -count,
          itemMatch: exactMatch,
        });
        toast.success(
          mode === 'RESTOCK'
            ? `Counted +${count} for ${result.name}`
            : `Removing ${count} from ${result.name}`
        );
      } else {
        toast.error('Could not identify product from the photo.');
      }
    } catch (error) {
      console.error('Photo Stock Error:', error);
      toast.error('Failed to process photo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const title = fixedMode === 'CONSUME' ? 'Photo — pull stock' : fixedMode === 'RESTOCK' ? 'Photo — add stock' : 'Visual stock manager';
  const subtitle =
    fixedMode === 'CONSUME'
      ? 'Photo shelves or pallets you are consuming from inventory.'
      : fixedMode === 'RESTOCK'
        ? 'Photo incoming pallets or shelves to add counts to a line.'
        : 'Switch Restock or Consume, then snap a photo to update counts.';

  return (
    <GlassCard className="flex h-full w-full flex-col items-center justify-center gap-5 py-8">
      <div className="text-center">
        <h3 className="text-xl font-bold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      {!fixedMode && (
        <div className="flex w-full max-w-[240px] rounded-2xl border border-slate-200/80 bg-white/60 p-1 shadow-inner">
          <button
            type="button"
            onClick={() => setInternalMode('RESTOCK')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-sm font-bold transition-all',
              mode === 'RESTOCK' ? 'bg-white text-maroon-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Plus className="h-4 w-4" /> Restock
          </button>
          <button
            type="button"
            onClick={() => setInternalMode('CONSUME')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-sm font-bold transition-all',
              mode === 'CONSUME' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Minus className="h-4 w-4" /> Consume
          </button>
        </div>
      )}

      <label
        className={cn(
          'flex h-24 w-24 cursor-pointer items-center justify-center rounded-[28px] shadow-lg transition-all duration-300',
          isProcessing
            ? 'cursor-not-allowed bg-slate-100 opacity-50'
            : mode === 'RESTOCK'
              ? 'wheat-grass-btn hover:scale-105'
              : 'bg-rose-500 hover:scale-105 hover:bg-rose-400'
        )}
      >
        <input
          type="file"
          className="hidden"
          capture="environment"
          onChange={handleFile}
          accept="image/*"
          disabled={isProcessing}
        />
        {isProcessing ? (
          <Loader2 className="h-10 w-10 animate-spin text-slate-500" />
        ) : (
          <Camera className="h-10 w-10 text-white" />
        )}
      </label>

      {isProcessing && (
        <div className="flex animate-pulse items-center gap-2 text-sm font-medium text-slate-500">
          Analyzing quantities…
        </div>
      )}
    </GlassCard>
  );
}
