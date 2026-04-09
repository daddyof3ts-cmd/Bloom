import { useState, useRef } from 'react';
import { Mic, MicOff, Loader2, CheckCircle2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { cn } from '@/src/lib/utils';
import { GlassCard } from './GlassCard';

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
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;

    recognitionRef.current.onstart = () => setIsListening(true);
    recognitionRef.current.onend = () => {
      setIsListening(false);
      if (latestTranscript.current) {
        processVoice(latestTranscript.current);
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
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const processVoice = async (text: string) => {
    setIsProcessing(true);
    try {
      if (!process.env.GEMINI_API_KEY) {
        alert("GEMINI_API_KEY is not set.");
        return;
      }
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro',
        contents: `Extract inventory item details from this voice input: "${text}". 
        Return JSON with fields: name, vendor, weight, quantity (number), program ("Open-Hours" or "Grocery").`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
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
      });

      const result = JSON.parse(response.text || '{}');
      onExtracted(result);
      setTranscript('');
    } catch (error) {
      console.error('AI Processing error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <GlassCard className="flex flex-col items-center justify-center gap-4 py-8 h-full w-full">
      <div className="text-center">
        <h3 className="text-xl font-bold text-slate-800">Voice Intake</h3>
        <p className="text-sm text-slate-500">"Add 10 cases of apples from Sysco to Grocery"</p>
      </div>

      <button
        onClick={isListening ? stopListening : startListening}
        disabled={isProcessing}
        className={cn(
          "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl",
          isListening ? "bg-red-500 animate-pulse scale-110" : "wheat-grass-btn",
          isProcessing && "opacity-50 cursor-not-allowed"
        )}
      >
        {isProcessing ? (
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        ) : isListening ? (
          <MicOff className="w-8 h-8 text-white" />
        ) : (
          <Mic className="w-8 h-8 text-white" />
        )}
      </button>

      {transcript && (
        <div className="text-sm font-medium text-slate-600 italic animate-in fade-in slide-in-from-bottom-2">
          "{transcript}"
        </div>
      )}

      {isProcessing && (
        <div className="flex items-center gap-2 text-maroon-600 font-medium">
          <Loader2 className="w-4 h-4 animate-spin" />
          AI is extracting details...
        </div>
      )}
    </GlassCard>
  );
}
