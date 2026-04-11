import { useState, useEffect, useMemo } from 'react';
import { InventoryItem, Program } from '@/src/types';
import { cn } from '@/src/lib/utils';
import {
  Search,
  ArrowRightLeft,
  Trash2,
  Package,
  History,
  Minus,
  Plus,
  Pencil,
  GitMerge,
  AlertTriangle,
} from 'lucide-react';
import Fuse from 'fuse.js';
import { format } from 'date-fns';
import { isItemIncomplete } from '@/src/lib/inventoryCompleteness';
import { LOW_STOCK_THRESHOLD, isLowStock, distinctCategories } from '@/src/lib/inventoryStats';

type ItemPatch = Partial<
  Pick<InventoryItem, 'name' | 'vendor' | 'weight' | 'category' | 'pricing' | 'quantity' | 'program'>
>;

interface InventoryTableProps {
  items: InventoryItem[];
  onTransfer: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onArchive: () => void;
  onViewHistory: () => void;
  onUpdateItem: (id: string, patch: ItemPatch) => void | Promise<void>;
  onEditItem: (item: InventoryItem) => void;
  onOpenMergeDuplicates: () => void;
}

function QuantityCell({
  item,
  onSave,
}: {
  item: InventoryItem;
  onSave: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(item.quantity));

  useEffect(() => {
    setDraft(String(item.quantity));
  }, [item.id, item.quantity]);

  const commit = () => {
    const n = Math.max(0, Math.floor(parseInt(draft, 10) || 0));
    setDraft(String(n));
    if (n !== item.quantity) onSave(n);
  };

  const step = (delta: number) => {
    const n = Math.max(0, item.quantity + delta);
    onSave(n);
  };

  return (
    <div className="flex items-center justify-end gap-1 sm:justify-start">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => step(-1)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:border-maroon-200 hover:bg-maroon-50"
      >
        <Minus className="h-5 w-5" />
      </button>
      <input
        aria-label="Quantity"
        type="text"
        inputMode="numeric"
        className="w-14 rounded-xl border border-slate-200 bg-white py-2 text-center font-mono text-sm font-medium text-slate-800 sm:w-16"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => step(1)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:border-maroon-200 hover:bg-maroon-50"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

function WeightCell({
  item,
  onSave,
}: {
  item: InventoryItem;
  onSave: (weight: string) => void;
}) {
  const [draft, setDraft] = useState(item.weight || '');

  useEffect(() => {
    setDraft(item.weight || '');
  }, [item.id, item.weight]);

  return (
    <input
      type="text"
      aria-label="Pack size or unit"
      placeholder="e.g. case, lb"
      className="max-w-[140px] rounded-xl border border-slate-200 bg-white/90 px-2 py-2 text-xs text-slate-700 sm:text-sm"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if ((draft || '') !== (item.weight || '')) onSave(draft);
      }}
    />
  );
}

export function InventoryTable({
  items,
  onTransfer,
  onDelete,
  onArchive,
  onViewHistory,
  onUpdateItem,
  onEditItem,
  onOpenMergeDuplicates,
}: InventoryTableProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Program | 'All'>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const categories = useMemo(() => distinctCategories(items), [items]);

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: ['name', 'vendor', 'category'],
        threshold: 0.28,
      }),
    [items]
  );

  const filteredItems = useMemo(() => {
    let result = search.length >= 1 ? fuse.search(search).map((r) => r.item) : items;
    if (filter !== 'All') {
      result = result.filter((i) => i.program === filter);
    }
    if (categoryFilter === '__empty__') {
      result = result.filter((i) => !(i.category || '').trim());
    } else if (categoryFilter !== 'All') {
      result = result.filter((i) => (i.category || '').trim() === categoryFilter);
    }
    if (lowStockOnly) {
      result = result.filter(isLowStock);
    }
    return result;
  }, [search, filter, categoryFilter, lowStockOnly, items, fuse]);

  const lowCount = useMemo(() => items.filter(isLowStock).length, [items]);

  return (
    <div className="space-y-4">
      {lowCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <span>
            <strong>{lowCount}</strong> line{lowCount === 1 ? '' : 's'} at or below{' '}
            <strong>{LOW_STOCK_THRESHOLD}</strong> units — running low on the shelf.
          </span>
          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            className={cn(
              'ml-auto rounded-full border px-3 py-1 text-xs font-bold transition-colors',
              lowStockOnly
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'
            )}
          >
            {lowStockOnly ? 'Show all lines' : 'Show only low stock'}
          </button>
        </div>
      )}

      <div className="flex flex-col items-stretch justify-between gap-4 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search inventory…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-maroon-400/30"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Program</span>
          <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white/80 p-1 shadow-sm">
            {(['All', 'Open-Hours', 'Grocery'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilter(p)}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-medium transition-all',
                  filter === p ? 'bg-white text-maroon-600 shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="max-w-[200px] rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-maroon-400/30"
          >
            <option value="All">All categories</option>
            <option value="__empty__">Uncategorized</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onOpenMergeDuplicates}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <GitMerge className="h-4 w-4 text-maroon-600" />
            <span className="hidden sm:inline">Merge duplicates</span>
            <span className="sm:hidden">Merge</span>
          </button>
          <button
            type="button"
            onClick={onViewHistory}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">View logs</span>
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold wheat-grass-btn"
          >
            <Package className="h-4 w-4" />
            Rollover
          </button>
        </div>
      </div>

      <div className="tracker-table-wrap overflow-x-auto">
        <table className="min-w-[720px] w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Item</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Category</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Program</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Units</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Pack</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Pricing</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <tr
                key={item.id}
                className={cn(
                  'group transition-colors hover:bg-slate-50/90',
                  isItemIncomplete(item) && 'bg-rose-50/50',
                  isLowStock(item) && 'bg-amber-50/40'
                )}
              >
                <td className="align-top px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-xl bg-maroon-100 p-2 text-maroon-600">
                      <Package className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{item.name}</span>
                        {isLowStock(item) && (
                          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                            Low
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-slate-500">{item.vendor || '—'}</div>
                    </div>
                  </div>
                </td>
                <td className="align-top px-4 py-3">
                  <span className="text-sm font-medium text-slate-600">{item.category || '—'}</span>
                </td>
                <td className="align-top px-4 py-3">
                  <span
                    className={cn(
                      'inline-block rounded-full px-3 py-1 text-xs font-semibold',
                      item.program === 'Open-Hours'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-maroon-100 text-maroon-800'
                    )}
                  >
                    {item.program}
                  </span>
                </td>
                <td className="align-top px-4 py-3">
                  <QuantityCell item={item} onSave={(n) => onUpdateItem(item.id, { quantity: n })} />
                </td>
                <td className="align-top px-4 py-3">
                  <WeightCell item={item} onSave={(w) => onUpdateItem(item.id, { weight: w })} />
                </td>
                <td className="align-top px-4 py-3">
                  <span className="text-sm font-medium text-slate-600">{item.pricing || '—'}</span>
                </td>
                <td className="align-top px-4 py-3 text-sm text-slate-500">
                  {format(item.lastUpdated.toDate(), 'MMM d, h:mm a')}
                </td>
                <td className="align-top px-4 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onEditItem(item)}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-maroon-600 shadow-sm transition-colors hover:bg-maroon-50"
                      title="Edit row"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onTransfer(item)}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-maroon-600 shadow-sm transition-colors hover:bg-maroon-50"
                      title="Transfer"
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-red-600 shadow-sm transition-colors hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredItems.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-500">
            No rows match these filters. Try clearing search or category.
          </div>
        )}
      </div>
    </div>
  );
}
