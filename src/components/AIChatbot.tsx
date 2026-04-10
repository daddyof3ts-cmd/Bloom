import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, X, Loader2, Bot, User, Search, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import { cn } from '@/src/lib/utils';
import { InventoryItem } from '@/src/types';

interface AIChatbotProps {
  inventory: InventoryItem[];
}

export function AIChatbot({ inventory }: AIChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'bot'; content: string }[]>([
    { id: 'initial-msg', role: 'bot', content: 'Hello! I am Bloom AI. How can I help you with your inventory today?' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [isMuted, setIsMuted] = useState(false); // Default to voice on (if not muted)

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
    recognitionRef.current.onend = () => setIsListening(false);
    
    recognitionRef.current.onresult = (event: any) => {
      const current = event.results[event.results.length - 1][0].transcript;
      setInput(current); // Using setInput from the current state
    };

    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: userMsg }]);
    setIsTyping(true);

    try {
      if (!process.env.GEMINI_API_KEY) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'bot', content: 'API Key missing.'}]);
        return;
      }
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro',
        contents: `You are an inventory assistant. Current inventory context: ${JSON.stringify(inventory)}. 
        User question: "${userMsg}". 
        Provide helpful technical support or find specific information from the inventory instantly.`,
      });

      const responseText = response.text || 'I am sorry, I could not process that.';
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'bot', content: responseText }]);

      // Simple Text-to-speech
      if (!isMuted && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stop any overlapping audio
        const plainText = responseText.replace(/[*#]/g, ''); // Strip simple markdown characters
        const utterance = new SpeechSynthesisUtterance(plainText);
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'bot', content: 'Error connecting to AI. Please try again.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-5 right-8 w-14 h-14 wheat-grass-btn rounded-full flex items-center justify-center hover:scale-110 transition-transform z-50 shadow-md"
      >
        <MessageCircle className="w-7 h-7" />
      </button>

      {isOpen && (
        <div className="fixed top-24 right-8 w-96 max-h-[85vh] h-[600px] liquid-glass rounded-[40px] shadow-2xl flex flex-col overflow-hidden z-50 border border-white/30 animate-in fade-in zoom-in-95 duration-300">
          <div className="p-6 bg-maroon-600/10 border-b border-white/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-maroon-600 rounded-xl text-white">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Bloom AI</h3>
                <p className="text-xs text-slate-500">Inventory Assistant</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/50 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={cn(
                "flex gap-3",
                msg.role === 'user' ? "flex-row-reverse" : ""
              )}>
                <div className={cn(
                  "p-2 rounded-xl h-fit",
                  msg.role === 'user' ? "bg-maroon-600 text-white" : "bg-white/50 text-slate-800"
                )}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={cn(
                  "max-w-[80%] p-4 rounded-3xl text-sm",
                  msg.role === 'user' ? "bg-maroon-600 text-white rounded-tr-none" : "bg-white/80 text-slate-800 rounded-tl-none shadow-sm"
                )}>
                  <div className="markdown-body prose prose-sm prose-slate max-w-none">
                    <Markdown>
                      {msg.content}
                    </Markdown>
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-3">
                <div className="p-2 rounded-xl bg-white/50 h-fit">
                  <Bot className="w-4 h-4 text-slate-800" />
                </div>
                <div className="bg-white/80 p-4 rounded-3xl rounded-tl-none shadow-sm flex gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-white/50 border-t border-white/20">
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-3 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-maroon-600 transition-colors shadow-sm shrink-0"
                title={isMuted ? "Unmute AI Voice" : "Mute AI Voice"}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              
              <button
                onClick={isListening ? stopListening : startListening}
                className={cn("p-3 rounded-xl transition-all shadow-sm shrink-0", isListening ? "bg-red-500 text-white animate-pulse" : "bg-white border border-slate-200 text-slate-500 hover:text-maroon-600")}
                title={isListening ? "Stop Recording" : "Use Microphone"}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Ask Bloom anything..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  className="w-full pl-4 pr-12 py-3 bg-white border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-maroon-400/50 shadow-sm"
                />
                <button
                  onClick={handleSend}
                  disabled={isTyping}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 wheat-grass-btn rounded-xl disabled:opacity-50 transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
