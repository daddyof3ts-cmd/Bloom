import { useState, useMemo } from 'react';
import { InventoryItem, Program } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { Search, ArrowRightLeft, Trash2, Package, History } from 'lucide-react';
import Fuse from 'fuse.js';
import { format } from 'date-fns';

interface InventoryTableProps {
  items: InventoryItem[];
  onTransfer: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onArchive: () => void;
  onViewHistory: () => void;
}

export function InventoryTable({ items, onTransfer, onDelete, onArchive, onViewHistory }: InventoryTableProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Program | 'All'>('All');

  const fuse = useMemo(() => new Fuse(items, {
    keys: ['name', 'vendor'],
    threshold: 0.3,
  }), [items]);

  const filteredItems = useMemo(() => {
    let result = search.length >= 2 ? fuse.search(search).map(r => r.item) : items;
    if (filter !== 'All') {
      result = result.filter(i => i.program === filter);
    }
    return result;
  }, [search, filter, items, fuse]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search inventory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white/50 border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-maroon-400/50 backdrop-blur-md transition-all"
          />
        </div>
        
        <div className="flex gap-2 p-1 bg-white/30 backdrop-blur-md rounded-2xl border border-white/20">
          {(['All', 'Open-Hours', 'Grocery'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                filter === p ? "bg-white shadow-sm text-maroon-600" : "text-slate-600 hover:bg-white/50"
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onViewHistory}
            className="flex items-center gap-2 px-6 py-3 bg-white text-slate-700 rounded-2xl hover:bg-slate-50 transition-all shadow-md"
          >
            <History className="w-5 h-5" />
            <span className="hidden sm:inline">View Logs</span>
          </button>
          <button
            onClick={onArchive}
            className="flex items-center gap-2 px-6 py-3 wheat-grass-btn rounded-2xl"
          >
            <Package className="w-5 h-5" />
            <span className="hidden sm:inline">Rollover</span>
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/20 bg-white/30 backdrop-blur-md">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/50 border-b border-white/20">
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Item</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Category</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Program</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Units</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Pricing</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Last Updated</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-white/40 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-maroon-100 rounded-xl text-maroon-600">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.vendor} • {item.weight}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-slate-600">{item.category || '-'}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold",
                    item.program === 'Open-Hours' ? "bg-purple-100 text-purple-700" : "bg-maroon-100 text-maroon-700"
                  )}>
                    {item.program}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="font-mono font-medium text-slate-700">{item.quantity}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-slate-600">{item.pricing || '-'}</span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {format(item.lastUpdated.toDate(), 'MMM d, h:mm a')}
                </td>
                  <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onTransfer(item)}
                      className="p-3 min-h-[48px] min-w-[48px] flex items-center justify-center hover:bg-maroon-100 rounded-2xl text-maroon-600 transition-colors shadow-sm"
                      title="Transfer Stock"
                    >
                      <ArrowRightLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="p-3 min-h-[48px] min-w-[48px] flex items-center justify-center hover:bg-red-100 rounded-2xl text-red-600 transition-colors shadow-sm"
                      title="Delete Item"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredItems.length === 0 && (
          <div className="py-20 text-center text-slate-500">
            No items found. Add some to get started.
          </div>
        )}
      </div>
    </div>
  );
}
