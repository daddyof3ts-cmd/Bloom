import { useMemo, useState, useEffect, useRef } from 'react';
import { X, Loader2, GitMerge, Sparkles, Layers } from 'lucide-react';
import { InventoryItem } from '@/src/types';
import { cn } from '@/src/lib/utils';
import Fuse from 'fuse.js';
import {
  compareItemsSmart,
  compareItemsFallback,
  compareItemsWithGemini,
  type CompareItemsResult,
} from '@/src/lib/compareItemsWithGemini';

export interface DuplicatePair {
  a: InventoryItem;
  b: InventoryItem;
  fuseScore: number;
}

function findDuplicateCandidates(items: InventoryItem[]): DuplicatePair[] {
  const byProgram = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const list = byProgram.get(item.program) ?? [];
    list.push(item);
    byProgram.set(item.program, list);
  }

  const seen = new Set<string>();
  const pairs: DuplicatePair[] = [];

  for (const [, list] of byProgram) {
    if (list.length < 2) continue;
    const fuse = new Fuse(list, {
      keys: ['name'],
      threshold: 0.45,
      includeScore: true,
    });

    for (const item of list) {
      const results = fuse.search(item.name);
      for (const r of results) {
        const other = r.item;
        if (other.id === item.id) continue;
        const ida = item.id < other.id ? item.id : other.id;
        const idb = item.id < other.id ? other.id : item.id;
        const key = `${ida}|${idb}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const score = r.score ?? 1;
        if (score < 0.5) {
          pairs.push({
            a: item,
            b: other,
            fuseScore: score,
          });
        }
      }
    }
  }

  return pairs.sort((p, q) => p.fuseScore - q.fuseScore);
}

interface MergeDuplicatesModalProps {
  items: InventoryItem[];
  onClose: () => void;
  onMerge: (keepId: string, removeId: string) => Promise<void>;
}

function pairKey(a: InventoryItem, b: InventoryItem) {
  return [a.id, b.id].sort().join('|');
}

function canMergePair(
  a: InventoryItem,
  b: InventoryItem,
  checks: Record<string, CompareItemsResult | 'loading' | null>,
  overrides: Record<string, boolean>
): boolean {
  const key = pairKey(a, b);
  if (overrides[key]) return true;
  const c = checks[key];
  if (c && c !== 'loading' && typeof c === 'object' && c.same) return true;
  return false;
}

export function MergeDuplicatesModal({ items, onClose, onMerge }: MergeDuplicatesModalProps) {
  const candidates = useMemo(() => findDuplicateCandidates(items), [items]);
  const [checks, setChecks] = useState<Record<string, CompareItemsResult | 'loading' | null>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [merging, setMerging] = useState<string | null>(null);
  const [bulkMerging, setBulkMerging] = useState(false);
  const [aiAllLoading, setAiAllLoading] = useState(false);

  const itemsRef = useRef(items);
  const candidatesRef = useRef(candidates);
  const checksRef = useRef(checks);
  const overridesRef = useRef(overrides);
  itemsRef.current = items;
  candidatesRef.current = candidates;
  checksRef.current = checks;
  overridesRef.current = overrides;

  useEffect(() => {
    setChecks((prev) => {
      const next: Record<string, CompareItemsResult | 'loading' | null> = {};
      for (const { a, b } of candidates) {
        const k = pairKey(a, b);
        const existing = prev[k];
        if (existing && existing !== 'loading' && typeof existing === 'object') {
          next[k] = existing;
        } else {
          next[k] = compareItemsFallback(a, b);
        }
      }
      return next;
    });
    setOverrides((prev) => {
      const validKeys = new Set(candidates.map(({ a, b }) => pairKey(a, b)));
      const next: Record<string, boolean> = {};
      for (const k of validKeys) {
        if (prev[k]) next[k] = true;
      }
      return next;
    });
  }, [candidates]);

  const runAiCheck = async (a: InventoryItem, b: InventoryItem) => {
    const key = pairKey(a, b);
    setChecks((prev) => ({ ...prev, [key]: 'loading' }));
    try {
      const result = await compareItemsSmart(a, b);
      setChecks((prev) => ({ ...prev, [key]: result }));
    } catch (e) {
      console.error(e);
      setChecks((prev) => ({ ...prev, [key]: compareItemsFallback(a, b) }));
    }
  };

  const runAllAiChecks = async () => {
    if (!process.env.GEMINI_API_KEY) {
      alert('Add GEMINI_API_KEY to your environment to check every pair with AI.');
      return;
    }
    setAiAllLoading(true);
    try {
      const list = candidatesRef.current;
      for (const { a, b } of list) {
        await runAiCheck(a, b);
      }
    } finally {
      setAiAllLoading(false);
    }
  };

  const mergeAllMergeable = async () => {
    setBulkMerging(true);
    try {
      for (let iter = 0; iter < 50; iter++) {
        const current = itemsRef.current;
        const pairs = findDuplicateCandidates(current);
        if (pairs.length === 0) break;

        let mergedOne = false;
        for (const { a, b } of pairs) {
          const freshA = current.find((x) => x.id === a.id);
          const freshB = current.find((x) => x.id === b.id);
          if (!freshA || !freshB) continue;
          const k = pairKey(freshA, freshB);
          const check = checksRef.current[k];
          const override = overridesRef.current[k];
          const ok =
            override ||
            (check && check !== 'loading' && typeof check === 'object' && check.same);
          if (!ok) continue;
          await onMerge(freshA.id, freshB.id);
          mergedOne = true;
          break;
        }
        if (!mergedOne) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    } finally {
      setBulkMerging(false);
    }
  };

  const mergeAllWithAi = async () => {
    if (!process.env.GEMINI_API_KEY) {
      alert('GEMINI_API_KEY is required for Merge all with AI.');
      return;
    }
    setBulkMerging(true);
    try {
      for (let iter = 0; iter < 50; iter++) {
        const current = itemsRef.current;
        const pairs = findDuplicateCandidates(current);
        if (pairs.length === 0) break;

        let mergedOne = false;
        for (const { a, b } of pairs) {
          const freshA = current.find((x) => x.id === a.id);
          const freshB = current.find((x) => x.id === b.id);
          if (!freshA || !freshB) continue;
          const k = pairKey(freshA, freshB);
          setChecks((prev) => ({ ...prev, [k]: 'loading' }));
          let result: CompareItemsResult;
          try {
            result = await compareItemsWithGemini(freshA, freshB, process.env.GEMINI_API_KEY!);
          } catch (e) {
            console.error(e);
            result = compareItemsFallback(freshA, freshB);
          }
          setChecks((prev) => ({ ...prev, [k]: result }));
          if (!result.same) continue;
          await onMerge(freshA.id, freshB.id);
          mergedOne = true;
          break;
        }
        if (!mergedOne) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    } finally {
      setBulkMerging(false);
    }
  };

  const canMerge = (a: InventoryItem, b: InventoryItem) =>
    canMergePair(a, b, checks, overrides);

  const handleMerge = async (keep: InventoryItem, remove: InventoryItem) => {
    const key = pairKey(keep, remove);
    setMerging(key);
    try {
      await onMerge(keep.id, remove.id);
      setChecks((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } finally {
      setMerging(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col liquid-glass rounded-[32px] border border-white/30 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Merge duplicates</h2>
            <p className="text-sm text-slate-500 mt-1">
              Same program + similar names. Check with AI when available, then merge to add quantities into one row.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/50 text-slate-500"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {candidates.length > 0 && (
          <div className="flex flex-wrap gap-2 px-6 pb-4 border-b border-white/20">
            <button
              type="button"
              onClick={runAllAiChecks}
              disabled={
                aiAllLoading ||
                bulkMerging ||
                !process.env.GEMINI_API_KEY
              }
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-medium hover:bg-slate-50 disabled:opacity-45"
            >
              {aiAllLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-maroon-600" />
              )}
              Check all with AI
            </button>
            <button
              type="button"
              onClick={mergeAllMergeable}
              disabled={bulkMerging || aiAllLoading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-maroon-600 text-white text-sm font-bold hover:bg-maroon-700 disabled:opacity-45"
            >
              {bulkMerging ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Layers className="w-4 h-4" />
              )}
              Merge all
            </button>
            <button
              type="button"
              onClick={mergeAllWithAi}
              disabled={bulkMerging || aiAllLoading || !process.env.GEMINI_API_KEY}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-45"
            >
              {bulkMerging ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <GitMerge className="w-4 h-4" />
              )}
              Merge all with AI
            </button>
            <p className="w-full text-xs text-slate-500 mt-1">
              <strong>Merge all</strong> combines every pair that already counts as the same (fallback match, AI, or &quot;Merge anyway&quot;).
              <strong> Merge all with AI</strong> runs Gemini on each pair in order and only merges when AI says they match.
            </p>
          </div>
        )}

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {!process.env.GEMINI_API_KEY && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              GEMINI_API_KEY is not set — only exact name matches (after normalizing) count as &quot;same&quot; without AI. Set a key for smarter matching.
            </p>
          )}

          {candidates.length === 0 ? (
            <p className="text-center text-slate-500 py-12">
              No fuzzy duplicate pairs found (same program, similar names). Try renaming items to match before merging.
            </p>
          ) : (
            candidates.map(({ a, b, fuseScore }) => {
              const key = pairKey(a, b);
              const check = checks[key];
              const loading = check === 'loading';
              const result = check && check !== 'loading' ? check : null;

              return (
                <div
                  key={key}
                  className="rounded-2xl border border-white/30 bg-white/40 p-4 space-y-3"
                >
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex-1 min-w-[140px]">
                      <div className="font-semibold text-slate-700">{a.name}</div>
                      <div className="text-slate-500 text-xs mt-1">
                        Qty {a.quantity} · {a.weight || '—'} · {a.program}
                      </div>
                    </div>
                    <div className="flex items-center text-slate-400 font-bold">↔</div>
                    <div className="flex-1 min-w-[140px]">
                      <div className="font-semibold text-slate-700">{b.name}</div>
                      <div className="text-slate-500 text-xs mt-1">
                        Qty {b.quantity} · {b.weight || '—'} · {b.program}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">Name similarity score: {fuseScore.toFixed(3)} (lower is closer)</div>

                  {result && (
                    <div
                      className={cn(
                        'text-sm rounded-xl px-3 py-2',
                        result.same ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-700'
                      )}
                    >
                      <span className="font-medium">{result.same ? 'Same item' : 'Different items'}: </span>
                      {result.reason}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      onClick={() => runAiCheck(a, b)}
                      disabled={loading || aiAllLoading || bulkMerging}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-maroon-600" />
                      )}
                      Check with AI
                    </button>

                    <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrides[key] ?? false}
                        onChange={(e) =>
                          setOverrides((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                      />
                      Merge anyway (I&apos;m sure)
                    </label>

                    <div className="flex-1" />

                    <button
                      type="button"
                      onClick={() => handleMerge(a, b)}
                      disabled={!canMerge(a, b) || merging === key || bulkMerging || aiAllLoading}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl wheat-grass-btn text-sm font-bold disabled:opacity-40"
                      title="Keeps the first row&apos;s details and adds the second row&apos;s quantity"
                    >
                      {merging === key ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <GitMerge className="w-4 h-4" />
                      )}
                      Merge into first
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    Merge combines quantities into the first item above and removes the second. Use &quot;Merge anyway&quot; only if you accept the risk of combining different products.
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
