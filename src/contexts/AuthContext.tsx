import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch } from '../lib/api';
import type { RoleMetadata, UserProfile } from '../types';

interface AuthContextValue {
  user: UserProfile | null;
  roleMetadata: RoleMetadata | null;
  linkedParticipantId: string | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [roleMetadata, setRoleMetadata] = useState<RoleMetadata | null>(null);
  const [linkedParticipantId, setLinkedParticipantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        setError('Sign-in popup was closed before completing authentication.');
      } else {
        setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  }, [loadBackendProfile]);

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
