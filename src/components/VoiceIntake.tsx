import { useState, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { GEMINI_MODEL } from '@/src/config/gemini';
import { cn } from '@/src/lib/utils';
import { GlassCard } from './GlassCard';
import { toast } from 'sonner';

interface VoiceIntakeProps {
  onExtracted: (data: any) => void;
}

export function VoiceIntake({ onExtracted }: VoiceIntakeProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const latestTranscript = useRef('');

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;

    recognitionRef.current.onstart = () => setIsListening(true);
    recognitionRef.current.onend = () => {
      setIsListening(false);
      if (latestTranscript.current) {
        void processVoice(latestTranscript.current);
        latestTranscript.current = '';
      }
    };

    recognitionRef.current.onresult = (event: any) => {
      const current = event.results[event.results.length - 1][0].transcript;
      setTranscript(current);
      latestTranscript.current = current;
    };

    recognitionRef.current.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
  };

  const processVoice = async (text: string) => {
    setIsProcessing(true);
    try {
      if (!process.env.GEMINI_API_KEY) {
        toast.error('GEMINI_API_KEY is not set.');
        return;
      }
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Extract inventory item details from this voice input: "${text}".

Rules:
- quantity = unit count only (whole items, cases, cans, boxes). Must be a positive integer count.
- pricing = any dollar/currency amount, "for $X", "at 2 dollars", unit price. Put ALL money here, never in quantity.
- Examples: "5 cans at $1.50 each" → quantity 5, pricing "$1.50 each". "Add milk $3.99" → quantity 1 if one unit implied, pricing "$3.99". "twelve apples" → quantity 12, omit pricing.
Return JSON with name, vendor, weight, quantity, optional pricing, program ("Open-Hours" or "Grocery", default Grocery if unclear).`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              vendor: { type: Type.STRING },
              weight: { type: Type.STRING },
              pricing: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              program: { type: Type.STRING, enum: ['Open-Hours', 'Grocery'] },
            },
            required: ['name', 'quantity'],
          },
        },
      });

      const result = JSON.parse(response.text || '{}');
      onExtracted(result);
      setTranscript('');
      toast.message('Review the form — confirm or edit, then save.');
    } catch (error) {
      console.error('AI Processing error:', error);
      toast.error('Could not process voice. Try again or use manual entry.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <GlassCard className="flex h-full w-full flex-col items-center justify-center gap-4 py-8">
      <div className="text-center">
        <h3 className="text-xl font-bold text-slate-800">Voice intake</h3>
        <p className="text-sm text-slate-500">
          After speaking, you&apos;ll get a <strong>confirmation form</strong> to check every field before saving.
        </p>
        <p className="mt-1 text-xs text-slate-400">Example: &quot;Add 10 cases of apples from Sysco to Grocery&quot;</p>
      </div>

      <button
        type="button"
        onClick={isListening ? stopListening : startListening}
        disabled={isProcessing}
        className={cn(
          'flex h-20 w-20 items-center justify-center rounded-full shadow-xl transition-all duration-500',
          isListening ? 'scale-110 animate-pulse bg-red-500' : 'wheat-grass-btn',
          isProcessing && 'cursor-not-allowed opacity-50'
        )}
      >
        {isProcessing ? (
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        ) : isListening ? (
          <MicOff className="h-8 w-8 text-white" />
        ) : (
          <Mic className="h-8 w-8 text-white" />
        )}
      </button>

      {transcript && (
        <div className="animate-in fade-in slide-in-from-bottom-2 text-center font-mono text-sm font-medium italic text-maroon-700">
          &quot;{transcript}&quot;
        </div>
      )}

      {isProcessing && (
        <div className="flex items-center gap-2 font-medium text-maroon-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Filling draft for your review…
        </div>
      )}
    </GlassCard>
  );
}
