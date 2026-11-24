import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch } from '../lib/api';
import type { RoleMetadata, UserProfile } from '../types';

export type SignUpRole = 'programme_manager' | 'facilitator' | 'participant';

interface AuthContextValue {
  user: UserProfile | null;
  roleMetadata: RoleMetadata | null;
  linkedParticipantId: string | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (params: {
    fullName: string;
    email: string;
    password: string;
    role: SignUpRole;
  }) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  clearError: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing authentication.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please check your credentials and try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes or reset your password.';
    case 'auth/operation-not-allowed':
      return 'Email & Password sign-in is not enabled in Firebase Authentication settings.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [roleMetadata, setRoleMetadata] = useState<RoleMetadata | null>(null);
  const [linkedParticipantId, setLinkedParticipantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegisteringRef = useRef(false);

  const loadBackendProfile = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch<{
        user: UserProfile;
        roleMetadata: RoleMetadata | null;
        linkedParticipant: { id: string } | null;
      }>('/api/me');
      setUser(res.user);
      setRoleMetadata(res.roleMetadata);
      setLinkedParticipantId(res.linkedParticipant?.id ?? null);
    } catch (err) {
      console.error('Failed to synchronize profile:', err);
      setUser(null);
      setRoleMetadata(null);
      setLinkedParticipantId(null);
      setError(err instanceof Error ? err.message : 'Unable to load account profile.');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (isRegisteringRef.current) {
        return;
      }

      if (!firebaseUser) {
        setUser(null);
        setRoleMetadata(null);
        setLinkedParticipantId(null);
        setLoading(false);
        return;
      }

      await loadBackendProfile();
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadBackendProfile]);

  const signInWithGoogle = useCallback(async () => {
    try {
      setSigningIn(true);
      setError(null);
      await signInWithPopup(auth, googleAuthProvider);
      await loadBackendProfile();
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setSigningIn(false);
    }
  }, [loadBackendProfile]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      try {
        setSigningIn(true);
        setError(null);
        await signInWithEmailAndPassword(auth, email.trim(), password);
        await loadBackendProfile();
      } catch (err) {
        setError(mapFirebaseAuthError(err));
      } finally {
        setSigningIn(false);
      }
    },
    [loadBackendProfile]
  );

  const signUpWithEmail = useCallback(
    async ({
      fullName,
      email,
      password,
      role,
    }: {
      fullName: string;
      email: string;
      password: string;
      role: SignUpRole;
    }) => {
      isRegisteringRef.current = true;
      try {
        setSigningIn(true);
        setError(null);
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: fullName.trim() });
        await cred.user.getIdToken(true);

        const res = await apiFetch<{
          user: UserProfile;
          roleMetadata: RoleMetadata | null;
          linkedParticipant: { id: string } | null;
        }>('/api/auth/register-profile', {
          method: 'POST',
          body: { fullName: fullName.trim(), role },
        });

        setUser(res.user);
        setRoleMetadata(res.roleMetadata);
        setLinkedParticipantId(res.linkedParticipant?.id ?? null);
        setLoading(false);
      } catch (err) {
        setError(mapFirebaseAuthError(err));
      } finally {
        isRegisteringRef.current = false;
        setSigningIn(false);
      }
    },
    []
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      setSigningIn(true);
      setError(null);
      await sendPasswordResetEmail(auth, email.trim());
      return true;
    } catch (err) {
      setError(mapFirebaseAuthError(err));
      return false;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setRoleMetadata(null);
      setLinkedParticipantId(null);
      setError(null);
    } catch (err) {
      console.error('Sign-out failed:', err);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        roleMetadata,
        linkedParticipantId,
        loading,
        signingIn,
        error,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        clearError,
        signOut,
        refreshProfile: loadBackendProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
