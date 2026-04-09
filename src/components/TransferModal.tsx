import { useState } from 'react';
import { X, ArrowRightLeft, Loader2 } from 'lucide-react';
import { InventoryItem, Program } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface TransferModalProps {
  item: InventoryItem;
  onClose: () => void;
  onTransfer: (amount: number, toProgram: Program) => Promise<void>;
}

export function TransferModal({ item, onClose, onTransfer }: TransferModalProps) {
  const [amount, setAmount] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const toProgram: Program = item.program === 'Open-Hours' ? 'Grocery' : 'Open-Hours';

  const handleTransfer = async () => {
    if (amount <= 0 || amount > item.quantity) return;
    setIsProcessing(true);
    try {
      await onTransfer(amount, toProgram);
      onClose();
    } catch (error) {
      console.error('Transfer failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="w-full max-w-md liquid-glass rounded-[40px] p-8 shadow-2xl border border-white/30 animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-bold text-slate-800">Transfer Stock</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-white/50 rounded-3xl border border-white/20">
            <div className="text-sm text-slate-500 mb-1">Item</div>
            <div className="font-bold text-slate-800 text-lg">{item.name}</div>
            <div className="text-sm text-slate-500">{item.vendor} • {item.weight}</div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 p-4 bg-white/50 rounded-3xl border border-white/20 text-center">
              <div className="text-xs text-slate-500 mb-1">From</div>
              <div className="font-bold text-slate-800">{item.program}</div>
            </div>
            <div className="p-2 bg-maroon-100 rounded-full text-maroon-600">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div className="flex-1 p-4 bg-white/50 rounded-3xl border border-white/20 text-center">
              <div className="text-xs text-slate-500 mb-1">To</div>
              <div className="font-bold text-slate-800">{toProgram}</div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600 ml-2">Amount to Transfer</label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max={item.quantity}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-6 py-4 bg-white border border-white/20 rounded-3xl focus:outline-none focus:ring-2 focus:ring-maroon-400/50 text-xl font-bold text-slate-800"
              />
              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                / {item.quantity} available
              </div>
            </div>
          </div>

          <button
            onClick={handleTransfer}
            disabled={isProcessing || amount <= 0 || amount > item.quantity}
            className="w-full py-5 rounded-3xl font-bold text-lg wheat-grass-btn disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <ArrowRightLeft className="w-6 h-6" />
                Confirm Transfer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
