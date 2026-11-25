import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  DocumentReference,
  Unsubscribe,
} from 'firebase/firestore';
import { FirebaseWebConfig, NetworkData } from '../types/network';
import { sanitizeNetworkPayload } from '../utils/networkUtils';

const FIRESTORE_COLLECTION = 'networkState';
const FIRESTORE_DOC_ID = 'default';

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let stateDocRef: DocumentReference | null = null;

function resolveFirebaseConfig(): FirebaseWebConfig | null {
  const fromWindow = typeof window !== 'undefined' ? window.FIREBASE_CONFIG : undefined;
  const fromEnv: FirebaseWebConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  const cfg =
    fromWindow && fromWindow.apiKey && !String(fromWindow.apiKey).includes('YOUR_')
      ? fromWindow
      : fromEnv.apiKey
        ? fromEnv
        : fromWindow || null;

  return cfg;
}

export function isFirebaseConfigured(): boolean {
  const cfg = resolveFirebaseConfig();
  if (!cfg || typeof cfg !== 'object') return false;
  if (!cfg.apiKey || !cfg.projectId || !cfg.authDomain) return false;
  if (
    String(cfg.apiKey).includes('YOUR_') ||
    String(cfg.projectId).includes('YOUR_') ||
    String(cfg.authDomain).includes('YOUR_')
  ) {
    return false;
  }
  return true;
}

export function initFirebaseClient(): boolean {
  if (!isFirebaseConfigured()) return false;
  const cfg = resolveFirebaseConfig();
  if (!cfg) return false;

  try {
    appInstance = getApps().length ? getApps()[0] : initializeApp(cfg);
    authInstance = getAuth(appInstance);
    dbInstance = getFirestore(appInstance);
    stateDocRef = doc(dbInstance, FIRESTORE_COLLECTION, FIRESTORE_DOC_ID);
    return true;
  } catch (err) {
    console.error('Firebase init error:', err);
    return false;
  }
}

export function subscribeAuth(callback: (user: User | null) => void): Unsubscribe {
  if (!authInstance) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(authInstance, callback);
}

export async function signInAdmin(email: string, password: string): Promise<User> {
  if (!authInstance) {
    throw new Error('Firebase authentication is not initialized.');
  }
  try {
    const cred = await signInWithEmailAndPassword(authInstance, email, password);
    return cred.user;
  } catch (err: unknown) {
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
    if (code === 'auth/too-many-requests') {
      throw new Error('Too many failed attempts. Please wait a moment and try again.');
    }
    if (code === 'auth/network-request-failed') {
      throw new Error('Network error while contacting Firebase Authentication.');
    }
    throw new Error('Authentication failed. Check your admin email and password.');
  }
}

export async function signOutAdmin(): Promise<void> {
  if (authInstance) {
    await signOut(authInstance);
  }
}

export async function fetchInitialNetworkState(): Promise<NetworkData | null> {
  if (!stateDocRef) return null;
  const snap = await getDoc(stateDocRef);
  if (snap.exists() && snap.data()?.payload) {
    return sanitizeNetworkPayload(snap.data().payload);
  }
  return { airports: [], routes: [] };
}

export function subscribeNetworkState(
  onUpdate: (data: NetworkData, meta: { updatedAt?: string; updatedBy?: string }) => void,
  onError: (code: string) => void,
): Unsubscribe {
  if (!stateDocRef) {
    return () => {};
  }
  return onSnapshot(
    stateDocRef,
    (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.payload) {
        const raw = docSnap.data();
        onUpdate(sanitizeNetworkPayload(raw.payload), {
          updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
          updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : undefined,
        });
      }
    },
    (err) => {
      console.error('Firestore read error:', err);
      onError(err.code ? err.code.toUpperCase() : 'READ_ERR');
    },
  );
}

export async function publishNetworkState(data: NetworkData, user: User | null): Promise<void> {
  if (!stateDocRef) {
    throw new Error('Firebase is not configured in firebase-config.js.');
  }
  if (!user) {
    throw new Error('Please sign in with your admin account before publishing.');
  }

  await setDoc(stateDocRef, {
    payload: {
      airports: data.airports,
      routes: data.routes,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: user.email || user.uid,
  });
}
