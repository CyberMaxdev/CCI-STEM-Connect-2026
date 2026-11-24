import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, getSessionToken, publicApiFetch, setSessionToken } from '../lib/api';
import type { RoleMetadata, UserProfile } from '../types';

export interface EmailSignUpInput {
  fullName: string;
  email: string;
  password: string;
  selectedRole: 'programme_manager' | 'facilitator' | 'participant';
  inviteCode?: string;
}

interface AuthSessionResponse {
  token: string;
  user: UserProfile;
  roleMetadata: RoleMetadata | null;
  linkedParticipant: { id: string } | null;
  pendingRoleApproval?: boolean;
}

interface AuthContextValue {
  user: UserProfile | null;
  roleMetadata: RoleMetadata | null;
  linkedParticipantId: string | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: EmailSignUpInput) => Promise<void>;
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

  const clearError = useCallback(() => setError(null), []);

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
      setSessionToken(null);
      setUser(null);
      setRoleMetadata(null);
      setLinkedParticipantId(null);
      setError(err instanceof Error ? err.message : 'Unable to load account profile.');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        if (!getSessionToken()) {
          setUser(null);
          setRoleMetadata(null);
          setLinkedParticipantId(null);
        }
        setLoading(false);
        return;
      }

      // Firebase Google session takes precedence when Firebase user signs in
      setSessionToken(null);
      await loadBackendProfile();
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadBackendProfile]);

  const signInWithGoogle = useCallback(async () => {
    try {
      setSigningIn(true);
      setError(null);
      setSessionToken(null);
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

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setSigningIn(true);
      setError(null);
      const res = await publicApiFetch<AuthSessionResponse>('/api/auth/signin', {
        method: 'POST',
        body: { email, password },
      });
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      setSessionToken(res.token);
      setUser(res.user);
      setRoleMetadata(res.roleMetadata);
      setLinkedParticipantId(res.linkedParticipant?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signUpWithEmail = useCallback(async (input: EmailSignUpInput) => {
    try {
      setSigningIn(true);
      setError(null);
      const res = await publicApiFetch<AuthSessionResponse>('/api/auth/signup', {
        method: 'POST',
        body: input,
      });
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
      setSessionToken(res.token);
      setUser(res.user);
      setRoleMetadata(res.roleMetadata);
      setLinkedParticipantId(res.linkedParticipant?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account registration failed. Please try again.');
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setSessionToken(null);
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
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
        clearError,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
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
