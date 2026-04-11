import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  Timestamp,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from './firebase';
import { InventoryItem, Program } from './types';
import { InventoryTable } from './components/InventoryTable';
import { MergeDuplicatesModal } from './components/MergeDuplicatesModal';
import { VoiceIntake } from './components/VoiceIntake';
import { InvoiceOCR } from './components/InvoiceOCR';
import { AIChatbot } from './components/AIChatbot';
import { TransferModal } from './components/TransferModal';
import { ManualEntryForm } from './components/ManualEntryForm';
import { HistoryModal } from './components/HistoryModal';
import { GlassCard } from './components/GlassCard';
import { ExcelImport } from './components/ExcelImport';
import { PhotoStockUpdate } from './components/PhotoStockUpdate';
import { syncToSheets, flushSheetsQueue } from './lib/sheetsSync';
import { parseVoiceInventoryPayload } from './lib/voicePayload';
import { countIncompleteItems } from './lib/inventoryCompleteness';
import { saveGuestCheckpoint } from './lib/localCheckpoints';
import { unitsByCategory, countLowStock, LOW_STOCK_THRESHOLD } from './lib/inventoryStats';
import { toast } from 'sonner';
import {
  LogIn,
  LogOut,
  Package,
  Plus,
  Sparkles,
  LayoutDashboard,
  ListMinus,
  Boxes,
  AlertTriangle,
  TrendingDown,
  Undo2,
  Redo2,
  CircleHelp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BulkStockRemoveModal } from './components/BulkStockRemoveModal';
import { InventoryCharts } from './components/InventoryCharts';
import { HelpModal } from './components/HelpModal';
import { cappedPush, patchBefore, type ItemPatch, type UndoEntry } from './lib/inventoryUndo';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null);
  const [prefillData, setPrefillData] = useState<any>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [showBulkRemove, setShowBulkRemove] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const pauseUndoRecording = useRef(false);

  const isGuestMode = isGuest && !user;

  const recordUndo = useCallback((entry: UndoEntry) => {
    if (pauseUndoRecording.current) return;
    setRedoStack([]);
    setUndoStack((s) => cappedPush(s, entry));
  }, []);

  const updateItem = async (id: string, patch: ItemPatch) => {
    const existing = inventory.find((i) => i.id === id);
    if (!existing) return;
    const before = patchBefore(existing, patch);
    const merged: InventoryItem = {
      ...existing,
      ...patch,
      lastUpdated: Timestamp.now(),
    };
    if (isGuestMode) {
      if (!pauseUndoRecording.current) {
        recordUndo({ kind: 'patch', id, before, after: patch });
      }
      setInventory((prev) => prev.map((i) => (i.id === id ? merged : i)));
      void syncToSheets('UPDATE', merged);
      return;
    }
    setInventory((prev) => prev.map((i) => (i.id === id ? merged : i)));
    if (!pauseUndoRecording.current) {
      recordUndo({ kind: 'patch', id, before, after: patch });
    }
    void (async () => {
      try {
        await updateDoc(doc(db, 'inventory', id), {
          ...patch,
          lastUpdated: Timestamp.now(),
        });
        void syncToSheets('UPDATE', merged);
      } catch (error) {
        console.warn('Firebase update failed:', error);
        setInventory((prev) => prev.map((i) => (i.id === id ? existing : i)));
        setUndoStack((s) => {
          const last = s[s.length - 1];
          if (last?.kind === 'patch' && last.id === id) return s.slice(0, -1);
          return s;
        });
        toast.error('Failed to update item.');
      }
    })();
  };

  const mergeItems = async (keepId: string, removeId: string) => {
    const keep = inventory.find((i) => i.id === keepId);
    const remove = inventory.find((i) => i.id === removeId);
    if (!keep || !remove) return;
    const newQty = keep.quantity + remove.quantity;

    if (isGuestMode) {
      setInventory((prev) => {
        const next = prev.filter((i) => i.id !== removeId);
        return next.map((i) =>
          i.id === keepId
            ? { ...i, quantity: newQty, lastUpdated: Timestamp.now() }
            : i
        );
      });
    } else {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'inventory', keepId), {
          quantity: newQty,
          lastUpdated: Timestamp.now(),
        });
        batch.delete(doc(db, 'inventory', removeId));
        await batch.commit();
      } catch (e) {
        console.warn('Merge failed:', e);
        toast.error('Failed to merge items.');
        return;
      }
    }
    void syncToSheets('DELETE', remove);
    void syncToSheets('UPDATE', { ...keep, quantity: newQty, lastUpdated: Timestamp.now() });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    void flushSheetsQueue();
    const onOnline = () => void flushSheetsQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (!user && !isGuest) {
      setInventory([]);
      return;
    }
    
    // Offline / Local Storage Mode (Bypass Firebase completely)
    if (isGuest && !user) {
      const saved = localStorage.getItem('bloom_offline_inventory');
      if (saved) {
        try {
          // Parse and restore Timestamp objects if possible, or just raw data
          const parsed = JSON.parse(saved);
          // Restore timestamps to Dates for the table to parse
          const restored = parsed.map((item: any) => ({
            ...item,
            lastUpdated: item.lastUpdated ? { toDate: () => new Date(item.lastUpdated) } : { toDate: () => new Date() }
          }));
          setInventory(restored);
        } catch (e) {
          console.error('Failed to parse local inventory', e);
        }
      }
      return; // Do not attach Firebase listener
    }

    // Authenticated Mode
    let unsubscribe = () => {};
    try {
      const q = query(collection(db, 'inventory'), orderBy('lastUpdated', 'desc'));
      unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as InventoryItem[];
        setInventory(items);
      }, (error) => {
        console.warn('Firestore Error:', error);
      });
    } catch (e) {
      console.warn('Firebase init failed.', e);
    }

    return () => unsubscribe();
  }, [user, isGuest]);

  // Sync to purely local storage when in Guest mode
  useEffect(() => {
    if (isGuest && !user) {
      localStorage.setItem('bloom_offline_inventory', JSON.stringify(inventory));
    }
  }, [inventory, isGuest, user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      
      // Sync local storage data if it exists
      const saved = localStorage.getItem('bloom_offline_inventory');
      if (saved && result.user) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.length > 0) {
            const batch = writeBatch(db);
            for (const item of parsed) {
              const newRef = doc(collection(db, 'inventory'));
              const { id, lastUpdated, ...dataToUpload } = item;
              
              batch.set(newRef, {
                ...dataToUpload,
                lastUpdated: Timestamp.now()
              });
            }
            await batch.commit();
            localStorage.removeItem('bloom_offline_inventory');
            toast.success(`Synced ${parsed.length} offline items to the cloud.`);
          }
        } catch (e) {
          console.error("Failed to migrate offline inventory", e);
        }
      }
    } catch (error: any) {
      console.error('Login failed:', error);
      toast.error(
        `Login failed: ${error?.message || 'Unknown error'}. Ensure Google Auth is enabled in Firebase.`
      );
    }
  };

  const handleLogout = () => auth.signOut();

  const addItem = async (data: any) => {
    const lastUpdated = Timestamp.now();
    const newItem = { ...data, lastUpdated };

    if (isGuestMode) {
      const id = crypto.randomUUID();
      const full = { ...newItem, id } as InventoryItem;
      setInventory((prev) => [full, ...prev]);
      if (!pauseUndoRecording.current) {
        recordUndo({ kind: 'add', id, doc: { ...newItem } as Record<string, unknown> });
      }
      void syncToSheets('ADD', data);
      return;
    }

    const newRef = doc(collection(db, 'inventory'));
    const id = newRef.id;
    const optimistic = { id, ...newItem } as InventoryItem;
    setInventory((prev) => (prev.some((i) => i.id === id) ? prev : [optimistic, ...prev]));
    if (!pauseUndoRecording.current) {
      recordUndo({ kind: 'add', id, doc: { ...newItem } as Record<string, unknown> });
    }
    void (async () => {
      try {
        await setDoc(newRef, newItem);
        void syncToSheets('ADD', data);
      } catch (error) {
        console.warn('Firebase add bypassed:', error);
        setInventory((prev) => prev.filter((i) => i.id !== id));
        setUndoStack((s) => {
          const last = s[s.length - 1];
          if (last?.kind === 'add' && last.id === id) return s.slice(0, -1);
          return s;
        });
        toast.error('Failed to add item to database.');
      }
    })();
  };

  const deleteItem = async (id: string) => {
    const itemToDelete = inventory.find((i) => i.id === id);
    if (!itemToDelete) return;

    if (isGuestMode) {
      setInventory((prev) => prev.filter((i) => i.id !== id));
      if (!pauseUndoRecording.current) {
        recordUndo({ kind: 'delete', item: { ...itemToDelete } });
      }
      void syncToSheets('DELETE', itemToDelete);
      return;
    }

    setInventory((prev) => prev.filter((i) => i.id !== id));
    if (!pauseUndoRecording.current) {
      recordUndo({ kind: 'delete', item: { ...itemToDelete } });
    }
    void (async () => {
      try {
        await deleteDoc(doc(db, 'inventory', id));
        void syncToSheets('DELETE', itemToDelete);
      } catch (error) {
        console.warn('Firebase delete bypassed:', error);
        setInventory((prev) => (prev.some((i) => i.id === id) ? prev : [itemToDelete, ...prev]));
        setUndoStack((s) => {
          const last = s[s.length - 1];
          if (last?.kind === 'delete' && last.item.id === id) return s.slice(0, -1);
          return s;
        });
        toast.error('Failed to delete item from database.');
      }
    })();
  };

  const applyBulkSubtract = async (ops: { id: string; subtract: number }[]) => {
    if (ops.length === 0) return;
    const previousInventory = inventory;
    const next = inventory.map((i) => ({ ...i }));
    const changes: { id: string; beforeQty: number; afterQty: number }[] = [];
    for (const { id, subtract } of ops) {
      const idx = next.findIndex((x) => x.id === id);
      if (idx >= 0) {
        const beforeQty = next[idx].quantity;
        const afterQty = Math.max(0, next[idx].quantity - subtract);
        if (beforeQty !== afterQty) {
          changes.push({ id, beforeQty, afterQty });
        }
        next[idx] = {
          ...next[idx],
          quantity: afterQty,
          lastUpdated: Timestamp.now(),
        };
      }
    }
    if (changes.length === 0) return;

    if (isGuestMode) {
      setInventory(next);
      if (!pauseUndoRecording.current) {
        recordUndo({ kind: 'bulkQty', changes });
      }
      for (const c of changes) {
        const item = next.find((i) => i.id === c.id);
        if (item) void syncToSheets('UPDATE', item);
      }
      return;
    }

    setInventory(next);
    const chunkSize = 450;
    try {
      for (let i = 0; i < changes.length; i += chunkSize) {
        const batch = writeBatch(db);
        const slice = changes.slice(i, i + chunkSize);
        for (const c of slice) {
          const row = next.find((x) => x.id === c.id);
          if (!row) continue;
          batch.update(doc(db, 'inventory', c.id), {
            quantity: row.quantity,
            lastUpdated: Timestamp.now(),
          });
        }
        await batch.commit();
      }
    } catch (e) {
      console.warn('Bulk subtract failed', e);
      setInventory(previousInventory);
      toast.error('Failed to update one or more items.');
      throw e;
    }
    if (!pauseUndoRecording.current) {
      recordUndo({ kind: 'bulkQty', changes });
    }
    for (const c of changes) {
      const item = next.find((i) => i.id === c.id);
      if (item) void syncToSheets('UPDATE', item);
    }
  };

  const applyPatchToFirestore = async (id: string, patch: ItemPatch) => {
    await updateDoc(doc(db, 'inventory', id), {
      ...patch,
      lastUpdated: Timestamp.now(),
    });
  };

  const applyUndoEntry = async (entry: UndoEntry) => {
    const now = Timestamp.now();
    if (entry.kind === 'patch') {
      if (isGuestMode) {
        setInventory((prev) =>
          prev.map((i) => (i.id === entry.id ? { ...i, ...entry.before, lastUpdated: now } : i))
        );
      } else {
        setInventory((prev) =>
          prev.map((i) => (i.id === entry.id ? { ...i, ...entry.before, lastUpdated: now } : i))
        );
        await applyPatchToFirestore(entry.id, entry.before);
      }
      return;
    }
    if (entry.kind === 'bulkQty') {
      if (isGuestMode) {
        setInventory((prev) =>
          prev.map((i) => {
            const c = entry.changes.find((x) => x.id === i.id);
            return c ? { ...i, quantity: c.beforeQty, lastUpdated: now } : i;
          })
        );
      } else {
        setInventory((prev) =>
          prev.map((i) => {
            const c = entry.changes.find((x) => x.id === i.id);
            return c ? { ...i, quantity: c.beforeQty, lastUpdated: now } : i;
          })
        );
        for (let i = 0; i < entry.changes.length; i += 450) {
          const batch = writeBatch(db);
          const slice = entry.changes.slice(i, i + 450);
          for (const c of slice) {
            batch.update(doc(db, 'inventory', c.id), { quantity: c.beforeQty, lastUpdated: now });
          }
          await batch.commit();
        }
      }
      return;
    }
    if (entry.kind === 'add') {
      if (isGuestMode) {
        setInventory((prev) => prev.filter((i) => i.id !== entry.id));
      } else {
        await deleteDoc(doc(db, 'inventory', entry.id));
        setInventory((prev) => prev.filter((i) => i.id !== entry.id));
      }
      return;
    }
    if (entry.kind === 'delete') {
      const { id } = entry.item;
      const payload = {
        name: entry.item.name,
        vendor: entry.item.vendor || '',
        weight: entry.item.weight || '',
        category: entry.item.category || '',
        pricing: entry.item.pricing || '',
        quantity: entry.item.quantity,
        program: entry.item.program,
        lastUpdated: now,
      };
      if (isGuestMode) {
        setInventory((prev) => [{ ...entry.item, lastUpdated: now }, ...prev]);
      } else {
        await setDoc(doc(db, 'inventory', id), payload);
        setInventory((prev) => [{ ...entry.item, lastUpdated: now }, ...prev]);
      }
    }
  };

  const applyRedoEntry = async (entry: UndoEntry) => {
    const now = Timestamp.now();
    if (entry.kind === 'patch') {
      if (isGuestMode) {
        setInventory((prev) =>
          prev.map((i) => (i.id === entry.id ? { ...i, ...entry.after, lastUpdated: now } : i))
        );
      } else {
        setInventory((prev) =>
          prev.map((i) => (i.id === entry.id ? { ...i, ...entry.after, lastUpdated: now } : i))
        );
        await applyPatchToFirestore(entry.id, entry.after);
      }
      return;
    }
    if (entry.kind === 'bulkQty') {
      if (isGuestMode) {
        setInventory((prev) =>
          prev.map((i) => {
            const c = entry.changes.find((x) => x.id === i.id);
            return c ? { ...i, quantity: c.afterQty, lastUpdated: now } : i;
          })
        );
      } else {
        setInventory((prev) =>
          prev.map((i) => {
            const c = entry.changes.find((x) => x.id === i.id);
            return c ? { ...i, quantity: c.afterQty, lastUpdated: now } : i;
          })
        );
        for (let i = 0; i < entry.changes.length; i += 450) {
          const batch = writeBatch(db);
          const slice = entry.changes.slice(i, i + 450);
          for (const c of slice) {
            batch.update(doc(db, 'inventory', c.id), { quantity: c.afterQty, lastUpdated: now });
          }
          await batch.commit();
        }
      }
      return;
    }
    if (entry.kind === 'add') {
      if (isGuestMode) {
        setInventory((prev) => [{ id: entry.id, ...(entry.doc as Omit<InventoryItem, 'id'>) }, ...prev]);
      } else {
        await setDoc(doc(db, 'inventory', entry.id), entry.doc);
        setInventory((prev) => [
          { id: entry.id, ...(entry.doc as Omit<InventoryItem, 'id'>) } as InventoryItem,
          ...prev,
        ]);
      }
      return;
    }
    if (entry.kind === 'delete') {
      if (isGuestMode) {
        setInventory((prev) => prev.filter((i) => i.id !== entry.item.id));
      } else {
        await deleteDoc(doc(db, 'inventory', entry.item.id));
        setInventory((prev) => prev.filter((i) => i.id !== entry.item.id));
      }
    }
  };

  const performUndo = async () => {
    let entry: UndoEntry | undefined;
    setUndoStack((s) => {
      if (s.length === 0) return s;
      entry = s[s.length - 1];
      return s.slice(0, -1);
    });
    if (entry === undefined) return;
    setRedoStack((r) => cappedPush(r, entry));
    pauseUndoRecording.current = true;
    try {
      await applyUndoEntry(entry);
    } catch (e) {
      console.warn('Undo failed', e);
      toast.error('Could not undo.');
      setRedoStack((r) => r.slice(0, -1));
      setUndoStack((u) => cappedPush(u, entry!));
    } finally {
      pauseUndoRecording.current = false;
    }
  };

  const performRedo = async () => {
    let entry: UndoEntry | undefined;
    setRedoStack((r) => {
      if (r.length === 0) return r;
      entry = r[r.length - 1];
      return r.slice(0, -1);
    });
    if (entry === undefined) return;
    setUndoStack((u) => cappedPush(u, entry));
    pauseUndoRecording.current = true;
    try {
      await applyRedoEntry(entry);
    } catch (e) {
      console.warn('Redo failed', e);
      toast.error('Could not redo.');
      setUndoStack((u) => u.slice(0, -1));
      setRedoStack((r) => cappedPush(r, entry!));
    } finally {
      pauseUndoRecording.current = false;
    }
  };

  const undoRedoRef = useRef({ undo: performUndo, redo: performRedo });
  undoRedoRef.current = { undo: performUndo, redo: performRedo };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest('input, textarea, [contenteditable="true"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) void undoRedoRef.current.redo();
        else void undoRedoRef.current.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        void undoRedoRef.current.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addItemsBatched = async (items: any[]) => {
    if (items.length === 0) return;
    pauseUndoRecording.current = true;
    try {
      if (isGuestMode) {
        const newRows: InventoryItem[] = items.map((data) => {
          const lastUpdated = Timestamp.now();
          return { ...data, lastUpdated, id: crypto.randomUUID() } as InventoryItem;
        });
        setInventory((prev) => [...newRows, ...prev]);
      } else {
        const prepared = items.map((data) => {
          const lastUpdated = Timestamp.now();
          const ref = doc(collection(db, 'inventory'));
          return { ref, id: ref.id, payload: { ...data, lastUpdated } };
        });
        const chunkSize = 450;
        for (let i = 0; i < prepared.length; i += chunkSize) {
          const batch = writeBatch(db);
          const slice = prepared.slice(i, i + chunkSize);
          for (const row of slice) {
            batch.set(row.ref, row.payload);
          }
          await batch.commit();
        }
        const optimistic = prepared.map(
          (row) => ({ id: row.id, ...row.payload } as InventoryItem)
        );
        setInventory((prev) => {
          const ids = new Set(optimistic.map((o) => o.id));
          const rest = prev.filter((p) => !ids.has(p.id));
          return [...optimistic, ...rest];
        });
      }
      for (const item of items) {
        void syncToSheets('ADD', item);
      }
    } finally {
      pauseUndoRecording.current = false;
    }
  };

  const handleTransfer = async (amount: number, toProgram: Program) => {
    if (!transferItem) return;

    if (isGuestMode) {
      setInventory(prev => {
        const next = [...prev];
        const sourceIndex = next.findIndex(i => i.id === transferItem.id);
        if (sourceIndex >= 0) {
          next[sourceIndex] = { ...next[sourceIndex], quantity: next[sourceIndex].quantity - amount, lastUpdated: Timestamp.now() };
        }
        const targetIndex = next.findIndex(i => i.name === transferItem.name && i.program === toProgram);
        if (targetIndex >= 0) {
          next[targetIndex] = { ...next[targetIndex], quantity: next[targetIndex].quantity + amount, lastUpdated: Timestamp.now() };
        } else {
          next.unshift({
            id: crypto.randomUUID(),
            name: transferItem.name,
            vendor: transferItem.vendor || '',
            weight: transferItem.weight || '',
            category: transferItem.category || '',
            pricing: transferItem.pricing || '',
            quantity: amount,
            program: toProgram,
            lastUpdated: Timestamp.now()
          });
        }
        return next;
      });
    } else {
      try {
        const batch = writeBatch(db);
        const itemRef = doc(db, 'inventory', transferItem.id);
        
        const { increment } = await import('firebase/firestore');

        batch.update(itemRef, {
          quantity: increment(-amount),
          lastUpdated: Timestamp.now()
        });

        const existingTarget = inventory.find(i => i.name === transferItem.name && i.program === toProgram);
        if (existingTarget) {
          batch.update(doc(db, 'inventory', existingTarget.id), {
            quantity: increment(amount),
            lastUpdated: Timestamp.now()
          });
        } else {
          const newRef = doc(collection(db, 'inventory'));
          batch.set(newRef, {
            name: transferItem.name,
            vendor: transferItem.vendor || '',
            weight: transferItem.weight || '',
            category: transferItem.category || '',
            pricing: transferItem.pricing || '',
            quantity: amount,
            program: toProgram,
            lastUpdated: Timestamp.now()
          });
        }

        const transferRef = doc(collection(db, 'transfers'));
        batch.set(transferRef, {
          itemId: transferItem.id,
          itemName: transferItem.name,
          fromProgram: transferItem.program,
          toProgram,
          amount,
          timestamp: Timestamp.now()
        });

        await batch.commit();
      } catch (e) {
        console.warn('Firebase transfer bypassed:', e);
      }
    }
    void syncToSheets('TRANSFER', {
      name: transferItem.name,
      fromProgram: transferItem.program,
      toProgram,
      amount,
    });
  };

  const handleArchive = async () => {
    if (inventory.length === 0) return;

    if (!inventory.some((i) => i.quantity > 0)) {
      toast.error('All items are already zero. Add stock before creating a new baseline.');
      return;
    }

    const snapshotAt = new Date().toISOString();

    if (isGuest && !user) {
      saveGuestCheckpoint(inventory);
      toast.success('Checkpoint saved on this device. Existing stock carried forward.');
    } else {
      try {
        await addDoc(collection(db, 'checkpoints'), {
          timestamp: Timestamp.now(),
          items: inventory,
        });
        toast.success('Checkpoint saved. Existing stock carried forward.');
      } catch (error) {
        console.warn('Archive Firebase sync bypassed:', error);
        toast.error('Could not save checkpoint to cloud.');
        return;
      }
    }

    void syncToSheets('ROLLOVER', {
      items: inventory,
      snapshotAt,
      mode: isGuest && !user ? 'guest' : 'firebase',
    });
  };

  const incompleteCount = countIncompleteItems(inventory);
  const categoryRows = useMemo(() => unitsByCategory(inventory), [inventory]);
  const lowStockLines = useMemo(() => countLowStock(inventory), [inventory]);

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-maroon-100 border-t-maroon-600" />
      </div>
    );
  }

  if (!user && !isGuest) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="liquid-glass w-full max-w-md rounded-[40px] p-12 text-center shadow-xl"
        >
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-maroon-600 shadow-lg shadow-maroon-500/20">
            <Package className="h-10 w-10 text-white" />
          </div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-slate-900">Bloom</h1>
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-maroon-600">VT Food Pantry</p>
          <p className="mb-10 text-slate-500">
            Inventory for Open-Hours and Grocery — look up lines, checkpoints, and rollovers. No barcodes.
          </p>
          <button
            onClick={handleLogin}
            className="flex w-full items-center justify-center gap-3 rounded-3xl py-5 text-lg font-bold wheat-grass-btn"
          >
            <LogIn className="h-6 w-6" />
            Sign in with Google
          </button>

          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            onClick={() => setIsGuest(true)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white py-4 text-lg font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Continue as guest (offline)
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      <header className="sticky top-0 z-40 flex w-full items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md md:px-8">
        <div className="relative z-10 flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex">
            <img
              src={user?.photoURL || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
              className="h-8 w-8 rounded-full border border-slate-200"
              referrerPolicy="no-referrer"
              alt=""
            />
            <span className="max-w-[160px] truncate text-sm font-semibold text-slate-700">
              {user?.displayName || 'Local Guest'}
            </span>
          </div>
          <button
            onClick={() => {
              if (user) handleLogout();
              setIsGuest(false);
            }}
            className="rounded-2xl border border-slate-200 bg-white p-2.5 text-rose-600 shadow-sm transition-colors hover:bg-rose-50"
            title="Sign out or exit guest"
            type="button"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-maroon-600 p-2 text-white shadow-md">
            <Package className="h-6 w-6" />
          </div>
          <h1 className="pointer-events-auto text-xl font-bold tracking-tight text-slate-900">Bloom</h1>
        </div>

        <div className="relative z-10 ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => void performUndo()}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
            className="rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
          >
            <Undo2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => void performRedo()}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Y)"
            className="rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
          >
            <Redo2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            title="Help"
            className="rounded-2xl border border-slate-200 bg-white p-2.5 text-maroon-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <CircleHelp className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-4 pb-12 pt-8 md:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Boxes className="h-3.5 w-3.5 text-maroon-600" />
              Line items
            </div>
            <p className="font-mono text-2xl font-bold tabular-nums text-slate-900">{inventory.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total units</div>
            <p className="font-mono text-2xl font-bold tabular-nums text-slate-900">
              {inventory.reduce((s, i) => s + i.quantity, 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <TrendingDown className="h-3.5 w-3.5 text-amber-600" />
              Low stock (≤{LOW_STOCK_THRESHOLD})
            </div>
            <p className={`font-mono text-2xl font-bold tabular-nums ${lowStockLines > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
              {lowStockLines}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
              Missing detail
            </div>
            <p className={`font-mono text-2xl font-bold tabular-nums ${incompleteCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
              {incompleteCount}
            </p>
          </div>
        </div>

        {categoryRows.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Units by category</h3>
            <div className="flex flex-wrap gap-2">
              {categoryRows.map((row) => (
                <div
                  key={row.name}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 shadow-sm"
                >
                  <span className="font-semibold">{row.name}</span>
                  <span className="ml-2 font-mono text-maroon-700">{row.units} u</span>
                  <span className="text-slate-400"> · {row.lines} lines</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <InventoryCharts items={inventory} />

        <section>
          <h2 className="mb-4 text-lg font-bold text-slate-800">Add stock</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <VoiceIntake
              onExtracted={(data) => {
                const parsed = parseVoiceInventoryPayload(data);
                setPrefillData(parsed.ok === false ? parsed.partial : parsed.item);
                setEditItem(null);
                setShowAddForm(true);
              }}
            />
            <PhotoStockUpdate
              fixedMode="RESTOCK"
              inventory={inventory}
              onUpdate={async ({ name, quantityChange, itemMatch }) => {
                if (itemMatch) {
                  const newQty = Math.max(0, itemMatch.quantity + quantityChange);
                  await updateItem(itemMatch.id, { quantity: newQty });
                } else if (quantityChange > 0) {
                  await addItem({ name, quantity: quantityChange, program: 'Grocery' });
                } else {
                  toast.error(`Cannot add from unknown item: ${name}`);
                }
              }}
            />
            <GlassCard className="flex h-full flex-col justify-center gap-4">
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-maroon-100 p-2 text-maroon-600">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Forms &amp; files</h3>
                  <p className="text-xs text-slate-500">Manual row, vendor invoice scan, or spreadsheet import.</p>
                </div>
              </div>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setPrefillData(null);
                    setEditItem(null);
                    setShowAddForm(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold wheat-grass-btn"
                >
                  <Plus className="h-5 w-5" />
                  Manual entry
                </button>
                <InvoiceOCR
                  onExtracted={async (items) => {
                    await addItemsBatched(items);
                    toast.success(`Added ${items.length} lines from invoice`);
                  }}
                />
                <ExcelImport
                  onExtracted={async (items) => {
                    await addItemsBatched(items);
                    toast.success(`Imported ${items.length} rows`);
                  }}
                />
              </div>
            </GlassCard>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-bold text-slate-800">Remove stock</h2>
          <p className="mb-4 text-sm text-slate-500">
            Pull units from existing lines — photo consume, or bulk paste / Excel / voice removals.
          </p>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PhotoStockUpdate
              fixedMode="CONSUME"
              inventory={inventory}
              onUpdate={async ({ name, quantityChange, itemMatch }) => {
                if (itemMatch) {
                  const newQty = Math.max(0, itemMatch.quantity + quantityChange);
                  await updateItem(itemMatch.id, { quantity: newQty });
                } else {
                  toast.error(`No match for "${name}" — use the table or bulk remover.`);
                }
              }}
            />
            <GlassCard className="flex flex-col justify-center gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Bulk stock out</h3>
                <p className="text-sm text-slate-500">
                  Paste from Excel, upload a sheet, or speak a list of deductions. Matches your inventory names.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkRemove(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 py-4 text-base font-bold text-rose-800 transition-colors hover:bg-rose-100"
              >
                <ListMinus className="h-5 w-5" />
                Open bulk remover
              </button>
            </GlassCard>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-maroon-600" />
              <div>
                <h2 className="text-xl font-bold text-slate-900 md:text-2xl">Inventory dashboard</h2>
                <p className="text-xs text-slate-500">
                  Filter by program and category · low stock and missing-detail highlights
                </p>
              </div>
            </div>
          </div>

          <InventoryTable
            items={inventory}
            onTransfer={setTransferItem}
            onDelete={deleteItem}
            onArchive={handleArchive}
            onViewHistory={() => setShowHistory(true)}
            onUpdateItem={updateItem}
            onEditItem={(item) => {
              setEditItem(item);
              setPrefillData(null);
              setShowAddForm(true);
            }}
            onOpenMergeDuplicates={() => setShowMergeModal(true)}
          />
        </section>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showAddForm && (
          <ManualEntryForm
            key={editItem?.id ?? 'new'}
            inventory={inventory}
            initialData={prefillData}
            existingItem={editItem}
            onAdd={addItem}
            onUpdate={updateItem}
            onClose={() => {
              setShowAddForm(false);
              setPrefillData(null);
              setEditItem(null);
            }}
          />
        )}
        {showMergeModal && (
          <MergeDuplicatesModal
            items={inventory}
            onClose={() => setShowMergeModal(false)}
            onMerge={mergeItems}
          />
        )}
        {transferItem && (
          <TransferModal
            item={transferItem}
            onTransfer={handleTransfer}
            onClose={() => setTransferItem(null)}
          />
        )}
        {showHistory && (
          <HistoryModal onClose={() => setShowHistory(false)} isGuest={isGuest && !user} />
        )}
        {showBulkRemove && (
          <BulkStockRemoveModal
            inventory={inventory}
            onClose={() => setShowBulkRemove(false)}
            onApply={applyBulkSubtract}
          />
        )}
      </AnimatePresence>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {/* Chatbot */}
      <AIChatbot inventory={inventory} />
    </div>
  );
}
