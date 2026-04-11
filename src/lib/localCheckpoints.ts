import { InventoryItem } from '@/src/types';

const KEY = 'bloom_guest_checkpoints';

export type StoredGuestCheckpoint = {
  id: string;
  timestampIso: string;
  items: SerializedInventoryItem[];
};

/** Plain JSON shape for guest checkpoints */
export type SerializedInventoryItem = Omit<InventoryItem, 'lastUpdated'> & { lastUpdated: string };

function serializeItems(items: InventoryItem[]): SerializedInventoryItem[] {
  return items.map((item) => {
    const lu = item.lastUpdated;
    const iso =
      lu && typeof (lu as { toDate?: () => Date }).toDate === 'function'
        ? (lu as { toDate: () => Date }).toDate().toISOString()
        : new Date().toISOString();
    return { ...item, lastUpdated: iso };
  });
}

export function loadGuestCheckpoints(): StoredGuestCheckpoint[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredGuestCheckpoint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGuestCheckpoint(items: InventoryItem[]): StoredGuestCheckpoint {
  const cp: StoredGuestCheckpoint = {
    id: crypto.randomUUID(),
    timestampIso: new Date().toISOString(),
    items: serializeItems(items),
  };
  const list = [cp, ...loadGuestCheckpoints()];
  localStorage.setItem(KEY, JSON.stringify(list));
  return cp;
}

export function guestCheckpointToArchiveShape(cp: StoredGuestCheckpoint): {
  id: string;
  timestamp: { toDate: () => Date };
  items: InventoryItem[];
} {
  return {
    id: cp.id,
    timestamp: { toDate: () => new Date(cp.timestampIso) },
    items: cp.items.map((row) => ({
      ...row,
      lastUpdated: { toDate: () => new Date(row.lastUpdated) } as InventoryItem['lastUpdated'],
    })),
  };
}
