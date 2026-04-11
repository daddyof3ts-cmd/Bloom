import { InventoryItem } from '@/src/types';

/** Units at or below this count count as "running low" for volunteers. */
export const LOW_STOCK_THRESHOLD = 5;

export function isLowStock(item: InventoryItem): boolean {
  return item.quantity > 0 && item.quantity <= LOW_STOCK_THRESHOLD;
}

export function countLowStock(items: InventoryItem[]): number {
  return items.filter(isLowStock).length;
}

/** Sum of units per category label (blank category → "Uncategorized"). */
export function unitsByCategory(items: InventoryItem[]): { name: string; units: number; lines: number }[] {
  const map = new Map<string, { units: number; lines: number }>();
  for (const i of items) {
    const key = (i.category || '').trim() || 'Uncategorized';
    const cur = map.get(key) || { units: 0, lines: 0 };
    cur.units += i.quantity;
    cur.lines += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, units: v.units, lines: v.lines }))
    .sort((a, b) => b.units - a.units);
}

export function unitsByProgram(items: InventoryItem[]): { program: string; units: number }[] {
  const oh = items.filter((i) => i.program === 'Open-Hours').reduce((s, i) => s + i.quantity, 0);
  const gr = items.filter((i) => i.program === 'Grocery').reduce((s, i) => s + i.quantity, 0);
  return [
    { program: 'Open-Hours', units: oh },
    { program: 'Grocery', units: gr },
  ];
}

export function distinctCategories(items: InventoryItem[]): string[] {
  const set = new Set<string>();
  for (const i of items) {
    const c = (i.category || '').trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
