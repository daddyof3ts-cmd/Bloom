import { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Loader2, X, Save } from 'lucide-react';
import { InventoryItem, Program } from '@/src/types';
import { cn } from '@/src/lib/utils';
import Fuse from 'fuse.js';

function buildFormState(existingItem: InventoryItem | null | undefined, initialData?: any) {
  if (existingItem) {
    return {
      name: existingItem.name,
      vendor: existingItem.vendor || '',
      weight: existingItem.weight || '',
      category: existingItem.category || '',
      pricing: existingItem.pricing || '',
      quantity: existingItem.quantity,
      program: existingItem.program,
    };
  }
  return {
    name: initialData?.name || '',
    vendor: initialData?.vendor || '',
    weight: initialData?.weight || '',
    category: initialData?.category || '',
    pricing: initialData?.pricing || '',
    quantity: initialData?.quantity ?? 1,
    program: (initialData?.program as Program) || 'Open-Hours',
  };
}

interface ManualEntryFormProps {
  inventory: InventoryItem[];
  onAdd: (item: any) => Promise<void>;
  onUpdate?: (id: string, item: any) => Promise<void>;
  onClose: () => void;
  initialData?: any;
  existingItem?: InventoryItem | null;
}

export function ManualEntryForm({
  inventory,
  onAdd,
  onUpdate,
  onClose,
  initialData,
  existingItem,
}: ManualEntryFormProps) {
  const isEdit = Boolean(existingItem);
  const [formData, setFormData] = useState(() => buildFormState(existingItem ?? null, initialData));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const prefillKey = initialData ? JSON.stringify(initialData) : '';
  useEffect(() => {
    setFormData(buildFormState(existingItem ?? null, initialData));
  }, [existingItem?.id, prefillKey]);

  const fuse = useMemo(
    () =>
      new Fuse(inventory, {
        keys: ['name', 'vendor', 'category'],
        threshold: 0.3,
      }),
    [inventory]
  );

  const suggestions = useMemo(() => {
    if (formData.name.length < 2) return [];
    return fuse.search(formData.name).map((r) => r.item).slice(0, 5);
  }, [formData.name, fuse]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (item: InventoryItem) => {
    if (isEdit && existingItem && item.id === existingItem.id) return;
    setFormData((prev) => ({
      ...prev,
      name: item.name,
      vendor: item.vendor || prev.vendor,
      weight: item.weight || prev.weight,
      category: item.category || prev.category,
      pricing: item.pricing || prev.pricing,
      program: item.program,
    }));
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || formData.quantity < 0) return;

    const payload = {
      name: formData.name,
      vendor: formData.vendor,
      weight: formData.weight,
      category: formData.category,
      pricing: formData.pricing,
      quantity: formData.quantity,
      program: formData.program,
    };

    setIsSubmitting(true);
    try {
      if (isEdit && existingItem && onUpdate) {
        await onUpdate(existingItem.id, payload);
      } else {
        await onAdd(payload);
      }
      onClose();
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg liquid-glass rounded-[40px] p-8 shadow-2xl border border-white/30 animate-in fade-in zoom-in-95 duration-300"
      >
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-bold text-slate-800">
            {isEdit ? 'Edit inventory item' : 'Add Inventory Item'}
          </h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-white/50 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 relative" ref={suggestionsRef}>
              <label className="text-sm font-semibold text-slate-600 ml-2">Item Name</label>
              <input
                required
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, name: e.target.value }));
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full px-6 py-4 bg-white border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-maroon-400/50"
                placeholder="e.g. Apples"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-2 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                  {suggestions.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSuggestion(item)}
                      className="w-full px-4 py-3 text-left hover:bg-maroon-50 transition-colors flex items-center justify-between border-b last:border-0 border-slate-100"
                    >
                      <div className="font-medium text-slate-800">{item.name}</div>
                      <div className="text-xs text-slate-500">
                        {item.vendor} • {item.weight}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 ml-2">Vendor</label>
              <input
                type="text"
                value={formData.vendor}
                onChange={(e) => setFormData((prev) => ({ ...prev, vendor: e.target.value }))}
                className="w-full px-6 py-4 bg-white border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-maroon-400/50"
                placeholder="e.g. Sysco"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 ml-2">Weight / Unit</label>
              <input
                type="text"
                value={formData.weight}
                onChange={(e) => setFormData((prev) => ({ ...prev, weight: e.target.value }))}
                className="w-full px-6 py-4 bg-white border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-maroon-400/50"
                placeholder="e.g. 5lb Case"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 ml-2">Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full px-6 py-4 bg-white border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-maroon-400/50"
                placeholder="e.g. Produce, Canned Goods"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 ml-2">Pricing</label>
              <input
                type="text"
                value={formData.pricing}
                onChange={(e) => setFormData((prev) => ({ ...prev, pricing: e.target.value }))}
                className="w-full px-6 py-4 bg-white border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-maroon-400/50"
                placeholder="e.g. $1.99 / lb"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 ml-2">Units / Quantity</label>
              <input
                required
                type="number"
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                className="w-full px-6 py-4 bg-white border border-white/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-maroon-400/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600 ml-2">Program</label>
            <div className="flex gap-2 p-1 bg-white/30 backdrop-blur-md rounded-2xl border border-white/20">
              {(['Open-Hours', 'Grocery'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, program: p }))}
                  className={cn(
                    'flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                    formData.program === p ? 'bg-white shadow-sm text-maroon-600' : 'text-slate-600 hover:bg-white/50'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-5 rounded-3xl font-bold text-lg wheat-grass-btn disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isEdit ? (
              <>
                <Save className="w-6 h-6" />
                Save changes
              </>
            ) : (
              <>
                <Plus className="w-6 h-6" />
                Add to Inventory
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
