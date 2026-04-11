import { InventoryItem } from '@/src/types';

/** Row should be visually flagged when key pantry metadata is missing. */
export function isItemIncomplete(item: InventoryItem): boolean {
  const noVendor = !item.vendor?.trim();
  const noCategory = !item.category?.trim();
  const noWeight = !item.weight?.trim();
  return noVendor || noCategory || noWeight;
}

export function countIncompleteItems(items: InventoryItem[]): number {
  return items.filter(isItemIncomplete).length;
}
