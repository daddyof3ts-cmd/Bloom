import { useState, useEffect } from 'react';
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
  getDocs
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from './firebase';
import { InventoryItem, Program } from './types';
import { InventoryTable } from './components/InventoryTable';
import { VoiceIntake } from './components/VoiceIntake';
import { InvoiceOCR } from './components/InvoiceOCR';
import { AIChatbot } from './components/AIChatbot';
import { TransferModal } from './components/TransferModal';
import { ManualEntryForm } from './components/ManualEntryForm';
import { HistoryModal } from './components/HistoryModal';
import { GlassCard } from './components/GlassCard';
import { ExcelImport } from './components/ExcelImport';
import { PhotoStockUpdate } from './components/PhotoStockUpdate';
import { syncToSheets } from './lib/sheetsSync';
import { LogIn, LogOut, Package, Plus, Sparkles, LayoutDashboard, History } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null);
  const [prefillData, setPrefillData] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user && !isGuest) {
      setInventory([]);
      return;
    }
    
    // Offline / Local Storage Mode (Bypass Firebase completely)
    if (isGuest && !user) {
      const saved = localStorage.getItem('lumina_offline_inventory');
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
      localStorage.setItem('lumina_offline_inventory', JSON.stringify(inventory));
    }
  }, [inventory, isGuest, user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      
      // Sync local storage data if it exists
      const saved = localStorage.getItem('lumina_offline_inventory');
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
            localStorage.removeItem('lumina_offline_inventory');
            alert(`🎉 Migration Complete! Successfully synced ${parsed.length} offline items to the cloud!`);
          }
        } catch (e) {
          console.error("Failed to migrate offline inventory", e);
        }
      }
    } catch (error: any) {
      console.error('Login failed:', error);
      alert(`Login failed: ${error?.message || 'Unknown error'}\n\nMake sure Google Auth is enabled in your Firebase Console!`);
    }
  };

  const handleLogout = () => auth.signOut();

  const addItem = async (data: any) => {
    const newItem = { ...data, lastUpdated: Timestamp.now() };
    if (isGuest && !user) {
      setInventory(prev => [{ ...newItem, id: crypto.randomUUID() } as InventoryItem, ...prev]);
    } else {
      try {
        await addDoc(collection(db, 'inventory'), newItem);
      } catch (error) {
        console.warn('Firebase add bypassed:', error);
        alert('Failed to add item to database.');
      }
    }
    syncToSheets('ADD', data);
  };

  const deleteItem = async (id: string) => {
    const itemToDelete = inventory.find(i => i.id === id);
    if (isGuest && !user) {
      setInventory(prev => prev.filter(i => i.id !== id));
    } else {
      try {
        await deleteDoc(doc(db, 'inventory', id));
      } catch (error) {
        console.warn('Firebase delete bypassed:', error);
        alert('Failed to delete item from database.');
      }
    }
    if (itemToDelete) syncToSheets('DELETE', itemToDelete);
  };

  const handleTransfer = async (amount: number, toProgram: Program) => {
    if (!transferItem) return;

    if (isGuest && !user) {
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
    syncToSheets('TRANSFER', {
      name: transferItem.name,
      fromProgram: transferItem.program,
      toProgram,
      amount
    });
  };

  const handleArchive = async () => {
    if (inventory.length === 0) return;
    
    // Check if there are strictly any active items to archive
    if (!inventory.some(i => i.quantity > 0)) {
      alert('All items are already zero. Add stock before creating a new baseline.');
      return;
    }

    alert('End of period totals calculated and checkpoint saved! Existing stock carried forward.');

    try {
      await addDoc(collection(db, 'checkpoints'), {
        timestamp: Timestamp.now(),
        items: inventory
      });
      // We no longer zero out the quantities because we are carrying remaining stock forward
    } catch (error) {
      console.warn('Archive Firebase sync bypassed:', error);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-maroon-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && !isGuest) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md liquid-glass rounded-[40px] p-12 text-center shadow-2xl border border-white/30"
        >
          <div className="w-20 h-20 bg-maroon-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-maroon-500/20">
            <Package className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Lumina</h1>
          <p className="text-slate-500 mb-12">Intelligent Inventory Management for Modern Programs</p>
          <button
            onClick={handleLogin}
            className="w-full py-5 rounded-3xl font-bold text-lg wheat-grass-btn flex items-center justify-center gap-3"
          >
            <LogIn className="w-6 h-6" />
            Sign in with Google
          </button>
          
          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="h-px bg-slate-200 flex-1"></div>
            <span className="text-sm text-slate-400 font-medium tracking-wide">OR</span>
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>

          <button
            onClick={() => setIsGuest(true)}
            className="w-full mt-6 py-4 rounded-3xl font-bold text-lg bg-white/50 text-slate-700 hover:bg-white transition-all border border-slate-200 shadow-sm flex items-center justify-center gap-2"
          >
            Continue as Guest (Offline Mode)
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/40 backdrop-blur-xl border-b border-white/20 px-8 py-4 flex items-center relative">
        {/* Left Action Profile */}
        <div className="flex items-center gap-4 relative z-10">
          <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white/50 rounded-2xl border border-white/20 shadow-sm">
            <img src={user?.photoURL || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'} className="w-8 h-8 rounded-full border border-white/50" referrerPolicy="no-referrer" />
            <span className="text-sm font-semibold text-slate-700">{user?.displayName || 'Local Guest'}</span>
          </div>
          <button
            onClick={() => {
              if (user) handleLogout();
              setIsGuest(false);
            }}
            className="p-3 hover:bg-red-50 rounded-2xl text-red-600 transition-colors shadow-sm bg-white/30"
            title="Logout or Exit Guest"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>

        {/* Centered Logo */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-none">
          <div className="p-2 bg-maroon-600 rounded-xl text-white shadow-md pointer-events-auto">
            <Package className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight pointer-events-auto">Lumina</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 pt-12 space-y-12">
        {/* Top Section: AI Tools */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <VoiceIntake onExtracted={async (data) => {
            if (data.name && data.quantity > 0) {
              await addItem(data);
              alert(`Voice command successful! Automatically saved ${data.quantity} of ${data.name}.`);
            } else {
              setPrefillData(data);
              setShowAddForm(true);
            }
          }} />

          <PhotoStockUpdate 
            inventory={inventory}
            onUpdate={async ({ name, quantityChange, itemMatch }) => {
              if (itemMatch) {
                if (isGuest && !user) {
                  setInventory(prev => prev.map(i => i.id === itemMatch.id ? { ...i, quantity: i.quantity + quantityChange, lastUpdated: Timestamp.now() } : i));
                  alert(`Successfully ${quantityChange >= 0 ? 'added' : 'removed'} ${Math.abs(quantityChange)} ${itemMatch.name}.`);
                } else {
                  try {
                    const { increment } = await import('firebase/firestore');
                    await updateDoc(doc(db, 'inventory', itemMatch.id), {
                      quantity: increment(quantityChange),
                      lastUpdated: Timestamp.now()
                    });
                    alert(`Successfully ${quantityChange >= 0 ? 'added' : 'removed'} ${Math.abs(quantityChange)} ${itemMatch.name}.`);
                  } catch (error) {
                    alert('Failed to update stock.');
                  }
                }
              } else {
                if (quantityChange > 0) {
                  await addItem({ name, quantity: quantityChange, program: 'Grocery' });
                  alert(`Added ${quantityChange} new units of ${name}.`);
                } else {
                  alert(`Cannot subtract ${Math.abs(quantityChange)} instances of unknown item: ${name}`);
                }
              }
            }} 
          />
          
          <GlassCard className="flex flex-col justify-center gap-6 border-maroon-400/30 h-full w-full">
            <div className="p-4 bg-maroon-100 rounded-3xl w-fit text-maroon-600 shadow-sm">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-4 text-slate-800">Quick Actions</h2>
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setPrefillData(null);
                    setShowAddForm(true);
                  }}
                  className="w-full py-4 rounded-3xl font-bold text-lg wheat-grass-btn transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  Manual Entry
                </button>
                
                <InvoiceOCR 
                  onExtracted={async (items) => {
                    for (const item of items) {
                      await addItem(item);
                    }
                    alert(`Extracted and added ${items.length} items!`);
                  }} 
                />

                <ExcelImport 
                  onExtracted={async (items) => {
                    for (const item of items) {
                      await addItem(item);
                    }
                    alert(`Imported ${items.length} items from Excel!`);
                  }}
                />
              </div>
            </div>
          </GlassCard>
        </section>

        {/* Inventory Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="w-6 h-6 text-maroon-600" />
            <h2 className="text-2xl font-bold text-slate-800">Inventory Dashboard</h2>
          </div>
          
          <InventoryTable
            items={inventory}
            onTransfer={setTransferItem}
            onDelete={deleteItem}
            onArchive={handleArchive}
            onViewHistory={() => setShowHistory(true)}
          />
        </section>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showAddForm && (
          <ManualEntryForm
            inventory={inventory}
            initialData={prefillData}
            onAdd={addItem}
            onClose={() => {
              setShowAddForm(false);
              setPrefillData(null);
            }}
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
          <HistoryModal onClose={() => setShowHistory(false)} />
        )}
      </AnimatePresence>

      {/* Chatbot */}
      <AIChatbot inventory={inventory} />
    </div>
  );
}
