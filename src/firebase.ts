import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const databaseId =
  'firestoreDatabaseId' in firebaseConfig &&
  typeof (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId === 'string'
    ? (firebaseConfig as { firestoreDatabaseId: string }).firestoreDatabaseId
    : '(default)';
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
}, databaseId);
export const auth = getAuth();
