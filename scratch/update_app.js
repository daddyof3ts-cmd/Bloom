import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  "import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';",
  "import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';"
);

content = content.replace(
  "  const [isGuest, setIsGuest] = useState(false);\n",
  ""
);

const effectRegex = /  useEffect\(\(\) => \{\n\s*if \(\!user && \!isGuest\) \{[\s\S]*?\}, \[inventory, isGuest, user\]\);/g;
content = content.replace(
  effectRegex, 
  `  useEffect(() => {
    if (!user) {
      setInventory([]);
      return;
    }
    
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
  }, [user]);`
);


content = content.replace(
  `  const handleLogin = async () => {`,
  `  const handleGuestLogin = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error: any) {
      console.error('Guest login failed:', error);
      alert(\`Guest login failed: \${error?.message || 'Unknown error'}\`);
    }
  };

  const handleLogin = async () => {`
);

const addItemRegex = /  const addItem = async \(data: any\) => \{[\s\S]*?syncToSheets\('ADD', data\);\n\s*\};/g;
content = content.replace(
  addItemRegex,
  `  const addItem = async (data: any) => {
    const newItem = { ...data, lastUpdated: Timestamp.now() };
    try {
      await addDoc(collection(db, 'inventory'), newItem);
    } catch (error) {
      console.error('Failed to add item:', error);
      alert('Failed to add item to database.');
    }
    syncToSheets('ADD', data);
  };`
);

const deleteItemRegex = /  const deleteItem = async \(id: string\) => \{[\s\S]*?if \(itemToDelete\) syncToSheets\('DELETE', itemToDelete\);\n\s*\};/g;
content = content.replace(
  deleteItemRegex,
  `  const deleteItem = async (id: string) => {
    const itemToDelete = inventory.find(i => i.id === id);
    try {
      await deleteDoc(doc(db, 'inventory', id));
    } catch (error) {
      console.error('Failed to delete item:', error);
      alert('Failed to delete item from database.');
    }
    if (itemToDelete) syncToSheets('DELETE', itemToDelete);
  };`
);

const handleTransferRegex = /  const handleTransfer = async \(amount: number, toProgram: Program\) => \{[\s\S]*?syncToSheets\('TRANSFER', \{\n\s*name: transferItem\.name,\n\s*fromProgram: transferItem\.program,\n\s*toProgram,\n\s*amount\n\s*\}\);\n\s*\};/g;
content = content.replace(
  handleTransferRegex,
  `  const handleTransfer = async (amount: number, toProgram: Program) => {
    if (!transferItem) return;

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
      console.error('Failed to transfer item:', e);
    }
    
    syncToSheets('TRANSFER', {
      name: transferItem.name,
      fromProgram: transferItem.program,
      toProgram,
      amount
    });
  };`
);

content = content.replace(
  "if (!user && !isGuest) {",
  "if (!user) {"
);

content = content.replace(
  `onClick={() => setIsGuest(true)}`,
  `onClick={handleGuestLogin}`
);
content = content.replace(
  `Continue as Guest (Offline Mode)`,
  `Continue as Guest`
);

content = content.replace(
  `onClick={() => {\n              if (user) handleLogout();\n              setIsGuest(false);\n            }}`,
  `onClick={() => {\n              if (user) handleLogout();\n            }}`
);

content = content.replace(
  "user?.displayName || 'Local Guest'",
  "user?.isAnonymous ? 'Guest User' : (user?.displayName || 'Guest User')"
);

const photoRegex = /                if \(isGuest && !user\) \{[\s\S]*?alert\(\`Successfully \$\{quantityChange >= 0 \? 'added' : 'removed'\} \$\{Math\.abs\(quantityChange\)\} \$\{itemMatch\.name\}\.\`\);\n\s*\} else \{\n([\s\S]*?)\n\s*\}/g;
content = content.replace(
  photoRegex,
  "$1"
);

fs.writeFileSync('src/App.tsx', content);
console.log("App.tsx transformed successfully!");
