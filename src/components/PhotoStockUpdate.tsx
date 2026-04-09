import { useState } from 'react';
import { Camera, Loader2, Plus, Minus } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { cn } from '@/src/lib/utils';
import { GlassCard } from './GlassCard';
import { InventoryItem } from '@/src/types';

interface PhotoStockUpdateProps {
  onUpdate: (data: { name: string, quantityChange: number, itemMatch?: InventoryItem }) => void;
  inventory: InventoryItem[];
}

export function PhotoStockUpdate({ onUpdate, inventory }: PhotoStockUpdateProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'RESTOCK' | 'CONSUME'>('RESTOCK');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!process.env.GEMINI_API_KEY) {
      alert("GEMINI_API_KEY is not set.");
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
      
      const invContext = inventory.map(i => `${i.name} (ID: ${i.id})`).join(", ");
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro',
        contents: [
          {
            inlineData: {
              data: base64,
              mimeType: mimeType
            }
          },
          {
            text: `Identify the main product. Count its exact quantity based on visible cases or items.
            Inventory context: [${invContext}]. If it clearly matches an inventory item, use that name/ID, otherwise provide a clear generic name.
            Return JSON with: name (string), quantityCounted (number).`
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              quantityCounted: { type: Type.NUMBER }
            },
            required: ["name", "quantityCounted"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      if (result.name && (result.quantityCounted !== undefined)) {
        const count = result.quantityCounted || 1; // Default to 1 if it identified 0 or null by mistake on a valid object
        const exactMatch = inventory.find(i => i.name.toLowerCase() === result.name.toLowerCase() || i.id === result.name);
        onUpdate({
          name: result.name,
          quantityChange: mode === 'RESTOCK' ? count : -count,
          itemMatch: exactMatch
        });
      } else {
        alert("Could not identify product details from the photo.");
      }
    } catch (error) {
      console.error('Photo Stock Error:', error);
      alert('Failed to process photo.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <GlassCard className="flex flex-col items-center justify-center gap-6 py-8 h-full w-full">
      <div className="text-center">
        <h3 className="text-xl font-bold text-slate-800">Visual Stock Manager</h3>
        <p className="text-sm text-slate-500">Auto-update inventory from a photo</p>
      </div>

      <div className="flex bg-white/50 p-1 rounded-2xl w-full max-w-[240px] shadow-sm border border-slate-200/50">
        <button
          onClick={() => setMode('RESTOCK')}
          className={cn(
            "flex-1 py-2 flex items-center justify-center gap-1 rounded-xl text-sm font-bold transition-all",
            mode === 'RESTOCK' ? "bg-white text-maroon-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Plus className="w-4 h-4" /> Restock
        </button>
        <button
          onClick={() => setMode('CONSUME')}
          className={cn(
            "flex-1 py-2 flex items-center justify-center gap-1 rounded-xl text-sm font-bold transition-all",
            mode === 'CONSUME' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Minus className="w-4 h-4" /> Consume
        </button>
      </div>

      <label className={cn(
        "w-24 h-24 rounded-[32px] flex items-center justify-center transition-all duration-500 shadow-xl cursor-pointer",
        isProcessing ? "bg-slate-100 opacity-50 cursor-not-allowed" : mode === 'RESTOCK' ? "wheat-grass-btn hover:scale-105" : "bg-rose-500 hover:bg-rose-400 hover:scale-105"
      )}>
        <input type="file" className="hidden" capture="environment" onChange={handleFile} accept="image/*" disabled={isProcessing} />
        {isProcessing ? (
          <Loader2 className="w-10 h-10 text-slate-500 animate-spin" />
        ) : (
          <Camera className="w-10 h-10 text-white" />
        )}
      </label>
      
      {isProcessing && (
        <div className="flex items-center gap-2 text-slate-600 font-medium text-sm animate-pulse">
          Analyzing quantities...
        </div>
      )}
    </GlassCard>
  );
}
