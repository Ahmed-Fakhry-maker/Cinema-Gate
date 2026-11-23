import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api.ts';
import { firebaseAuth } from '../lib/firebase.ts';
import type { User } from '../types/cinema.ts';

type AuthMode = 'login' | 'signup';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authModalOpen: boolean;
  authMode: AuthMode;
  openAuthModal: (mode?: AuthMode, onSuccess?: () => void) => void;
  closeAuthModal: () => void;
  setAuthMode: (mode: AuthMode) => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/wrong-password': 'Invalid email or password.',
  'auth/user-not-found': 'Invalid email or password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
};

function friendlyAuthError(err: unknown): Error {
  const code = (err as { code?: string } | null)?.code;
  if (code && FIREBASE_ERRORS[code]) return new Error(FIREBASE_ERRORS[code]);
  return err instanceof Error ? err : new Error('Unable to authenticate.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  // While a login/signup is in flight it syncs the user itself, so the listener must not race it
  // (a signup would otherwise provision the account before the display name is set).
  const authInFlight = useRef(false);

  const syncUser = useCallback(async () => {
    setUser((await api.getMe()).user);
  }, []);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, (fbUser) => {
      if (authInFlight.current) return;
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      syncUser()
        .catch(() => setUser(null))
        .finally(() => setLoading(false));
    });
  }, [syncUser]);

  const finishAuth = useCallback(
    async (authenticate: () => Promise<void>) => {
      authInFlight.current = true;
      try {
        await authenticate();
        await syncUser();
      } catch (err) {
        await signOut(firebaseAuth).catch(() => undefined);
        setUser(null);
        throw friendlyAuthError(err);
      } finally {
        authInFlight.current = false;
      }
      setAuthModalOpen(false);
      if (pendingCallback) {
        const cb = pendingCallback;
        setPendingCallback(null);
        cb();
      }
    },
    [pendingCallback, syncUser],
  );

  const openAuthModal = useCallback((mode: AuthMode = 'login', onSuccess?: () => void) => {
    setAuthMode(mode);
    setPendingCallback(() => onSuccess ?? null);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    setPendingCallback(null);
  }, []);

  const login = useCallback(
    (email: string, password: string) =>
      finishAuth(async () => {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      }),
    [finishAuth],
  );

  const signup = useCallback(
    (name: string, email: string, password: string) =>
      finishAuth(async () => {
        const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        await updateProfile(cred.user, { displayName: name.trim() });
        await cred.user.getIdToken(true); // refresh so the token carries the new name
      }),
    [finishAuth],
  );

  const logout = useCallback(async () => {
    await signOut(firebaseAuth);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authModalOpen,
        authMode,
        openAuthModal,
        closeAuthModal,
        setAuthMode,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
