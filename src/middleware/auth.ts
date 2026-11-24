import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../lib/auth-security.ts';
import {
  type AppRole,
  type PublicUser,
  getUserById,
  syncAuthenticatedUser,
} from '../db/users.ts';

export type DbUser = PublicUser;

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  dbUser?: DbUser;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Invalid authentication token.' });
    return;
  }

  // 1. Server-issued HMAC session token (Email & Password Sign Up / Sign In)
  if (token.startsWith('cci1.')) {
    try {
      const payload = verifySessionToken(token);
      if (!payload) {
        res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
        return;
      }

      const dbUser = await getUserById(payload.sub);
      if (!dbUser) {
        res.status(401).json({ error: 'Account not found. Please sign in again.' });
        return;
      }

      if (!dbUser.isActive) {
        res.status(403).json({ error: 'Your account has been deactivated by an administrator.' });
        return;
      }

      req.dbUser = dbUser;
      next();
      return;
    } catch (error) {
      console.error('Session authentication error:', error);
      res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
      return;
    }
  }

  // 2. Firebase ID token (Google OAuth Sign-In)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      res.status(403).json({ error: 'An account email address is required to access this platform.' });
      return;
    }

    const dbUser = await syncAuthenticatedUser({
      uid: decoded.uid,
      email: decoded.email,
      fullName: typeof decoded.name === 'string' ? decoded.name : undefined,
      avatarUrl: typeof decoded.picture === 'string' ? decoded.picture : undefined,
    });

    if (!dbUser.isActive) {
      res.status(403).json({ error: 'Your account has been deactivated by an administrator.' });
      return;
    }

    req.firebaseUser = decoded;
    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Authentication verification error:', error);
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
};

export const requireRole = (allowedRoles: AppRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.dbUser?.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({
        error: 'Insufficient permissions for this action.',
      });
      return;
    }
    next();
  };
};
