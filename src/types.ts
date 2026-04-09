import { Timestamp } from 'firebase/firestore';

export type Program = 'Open-Hours' | 'Grocery';

export interface InventoryItem {
  id: string;
  name: string;
  vendor?: string;
  weight?: string;
  category?: string;
  pricing?: string;
  quantity: number;
  program: Program;
  lastUpdated: Timestamp;
}

export interface ProgramTransfer {
  id: string;
  itemId: string;
  itemName: string;
  fromProgram: Program;
  toProgram: Program;
  amount: number;
  timestamp: Timestamp;
}

export interface ArchiveCheckpoint {
  id: string;
  timestamp: Timestamp;
  items: InventoryItem[];
}
