import { useState, useEffect } from 'react';
import { X, Calendar, Search, Loader2 } from 'lucide-react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { ArchiveCheckpoint } from '@/src/types';
import { format } from 'date-fns';
import { loadGuestCheckpoints, guestCheckpointToArchiveShape } from '@/src/lib/localCheckpoints';

interface HistoryModalProps {
  onClose: () => void;
  isGuest: boolean;
}

export function HistoryModal({ onClose, isGuest }: HistoryModalProps) {
  const [checkpoints, setCheckpoints] = useState<ArchiveCheckpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchDate, setSearchDate] = useState('');

  useEffect(() => {
    let isMounted = true;

    if (isGuest) {
      const local = loadGuestCheckpoints().map(guestCheckpointToArchiveShape);
      if (isMounted) {
        setCheckpoints(local as ArchiveCheckpoint[]);
        setIsLoading(false);
      }
      return () => {
        isMounted = false;
      };
    }

    const fetchCheckpoints = async () => {
      try {
        const q = query(collection(db, 'checkpoints'), orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);
        if (!isMounted) return;
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ArchiveCheckpoint[];
        setCheckpoints(data);
      } catch (error) {
        if (isMounted) console.error('Error fetching checkpoints', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    void fetchCheckpoints();
    return () => {
      isMounted = false;
    };
  }, [isGuest]);

  const filteredCheckpoints = searchDate
    ? checkpoints.filter(
        (cp) =>
          format(cp.timestamp.toDate(), 'yyyy-MM-dd').includes(searchDate) ||
          format(cp.timestamp.toDate(), 'MMMM d, yyyy').toLowerCase().includes(searchDate.toLowerCase())
      )
    : checkpoints;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="w-full max-w-4xl max-h-[85vh] liquid-glass rounded-[40px] p-8 shadow-2xl border border-white/30 animate-in fade-in zoom-in-95 duration-300 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-maroon-600" />
              Archive History
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              {isGuest ? 'Checkpoints stored on this device (Guest mode)' : 'Search and view past inventory snapshots'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by date (e.g. 2026-04, October)..."
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white/50 border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-maroon-400/50 backdrop-blur-md"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-maroon-600 animate-spin" />
            </div>
          ) : filteredCheckpoints.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              No historical data found for {searchDate || 'this session'}.
            </div>
          ) : (
            filteredCheckpoints.map((cp) => (
              <div key={cp.id} className="bg-white/50 backdrop-blur-md rounded-3xl border border-white/20 p-6">
                <div className="border-b border-white/20 pb-4 mb-4 flex items-center justify-between">
                  <div className="font-bold text-lg text-slate-800">
                    {format(cp.timestamp.toDate(), 'MMMM d, yyyy h:mm a')}
                  </div>
                  <div className="text-sm font-medium text-slate-500 bg-white/50 px-3 py-1 rounded-xl">
                    {cp.items.filter((i) => i.quantity > 0).length} active items
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cp.items
                    .filter((i) => i.quantity > 0)
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-white/30 rounded-2xl">
                        <div>
                          <div className="font-semibold text-slate-700">{item.name}</div>
                          <div className="text-xs text-slate-500">
                            {item.program} • {item.vendor || 'No Vendor'}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-maroon-600 bg-maroon-50 px-3 py-1 rounded-lg">
                          {item.quantity}
                        </div>
                      </div>
                    ))}
                  {cp.items.filter((i) => i.quantity > 0).length === 0 && (
                    <div className="text-sm text-slate-400 italic">No items stored with &gt; 0 quantity</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
