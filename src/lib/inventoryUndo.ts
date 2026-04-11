import type { InventoryItem } from '@/src/types';

export type ItemPatch = Partial<
  Pick<InventoryItem, 'name' | 'vendor' | 'weight' | 'category' | 'pricing' | 'quantity' | 'program'>
>;

export type UndoEntry =
  | { kind: 'patch'; id: string; before: ItemPatch; after: ItemPatch }
  | { kind: 'bulkQty'; changes: { id: string; beforeQty: number; afterQty: number }[] }
  | { kind: 'add'; id: string; doc: Record<string, unknown> }
  | { kind: 'delete'; item: InventoryItem };

export const UNDO_STACK_CAP = 30;

export function patchBefore(existing: InventoryItem, patch: ItemPatch): ItemPatch {
  const before: ItemPatch = {};
  (Object.keys(patch) as (keyof ItemPatch)[]).forEach((k) => {
    const v = existing[k];
    (before as Record<string, unknown>)[k] = v;
  });
  return before;
}

export function cappedPush<T>(stack: T[], entry: T): T[] {
  return [...stack, entry].slice(-UNDO_STACK_CAP);
}
