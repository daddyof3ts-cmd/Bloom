import { useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { cn } from '@/src/lib/utils';

interface InvoiceOCRProps {
  onExtracted: (items: any[]) => void;
}

export function InvoiceOCR({ onExtracted }: InvoiceOCRProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setPreview(event.target?.result as string);
      await processInvoice(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const processInvoice = async (base64: string, mimeType: string) => {
    setIsProcessing(true);
    try {
      if (!process.env.GEMINI_API_KEY) {
        alert("GEMINI_API_KEY is not set.");
        return;
      }
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
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
            text: "Extract all line items from this invoice. Return an array of objects with: name, vendor (invoice issuer), weight, quantity (number), program (default to 'Grocery')."
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                vendor: { type: Type.STRING },
                weight: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                program: { type: Type.STRING, enum: ["Open-Hours", "Grocery"] }
              },
              required: ["name", "quantity", "program"]
            }
          }
        }
      });

      const result = JSON.parse(response.text || '[]');
      onExtracted(result);
    } catch (error) {
      console.error('OCR Error:', error);
    } finally {
      setIsProcessing(false);
      setPreview(null);
    }
  };

  return (
    <label className={cn(
      "w-full py-4 rounded-3xl font-bold text-lg wheat-grass-btn transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm",
      isProcessing && "opacity-50 cursor-not-allowed pointer-events-none"
    )}>
      <input type="file" className="hidden" capture="environment" onChange={handleFile} accept="image/*" />
      {isProcessing ? (
        <>
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Scanning Document...</span>
        </>
      ) : (
        <>
          <Camera className="w-6 h-6" />
          Scan with Camera
        </>
      )}
    </label>
  );
}
