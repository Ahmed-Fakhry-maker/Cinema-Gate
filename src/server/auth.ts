import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { NextFunction, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { User } from '../types/cinema.ts';

/** Identity proven by a Firebase ID token. */
export interface VerifiedIdentity {
  uid: string;
  email: string;
  name: string | null;
}

export type IdTokenVerifier = (idToken: string) => Promise<VerifiedIdentity>;

export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'cinema-gate-a0d5f';

/** Verifies Firebase ID tokens. Needs only the project id: signatures are checked against Google's public keys. */
export function createFirebaseVerifier(): IdTokenVerifier {
  const app = getApps()[0] ?? initializeApp({ projectId: FIREBASE_PROJECT_ID });
  const auth = getAuth(app);
  return async (idToken) => {
    const decoded = await auth.verifyIdToken(idToken);
    if (!decoded.email) throw new Error('Firebase token has no email.');
    return {
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      name: typeof decoded.name === 'string' ? decoded.name : null,
    };
  };
}

export interface AuthenticatedRequest extends Request {
  user?: User | null;
  /** Firebase uid from the verified token; keys per-user data stored outside SQLite. */
  firebaseUid?: string;
}

/** Thrown when a Firebase account's email already belongs to a different local account. */
export class AccountConflictError extends Error {}

export function attachAuthUser(db: DatabaseSync, verify: IdTokenVerifier) {
  const findByUid = db.prepare('SELECT id, name, email FROM users WHERE firebase_uid = ?');
  const findByEmail = db.prepare('SELECT id FROM users WHERE email = ?');
  const insert = db.prepare("INSERT INTO users (name, email, password_hash, firebase_uid) VALUES (?, ?, '', ?)");

  function resolveUser(identity: VerifiedIdentity): User {
    const existing = findByUid.get(identity.uid) as User | undefined;
    if (existing) return { id: existing.id, name: existing.name, email: existing.email };

    // Never link by email: Firebase does not verify addresses, so that would let anyone claim a legacy account.
    if (findByEmail.get(identity.email)) throw new AccountConflictError();

    const name = (identity.name?.trim() || identity.email.split('@')[0]).slice(0, 60);
    const result = insert.run(name, identity.email, identity.uid);
    return { id: Number(result.lastInsertRowid), name, email: identity.email };
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    authReq.user = null;

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next();
      return;
    }

    let identity: VerifiedIdentity;
    try {
      identity = await verify(header.slice(7).trim());
    } catch {
      next(); // invalid or expired token: treat as signed out
      return;
    }

    try {
      authReq.user = resolveUser(identity);
      authReq.firebaseUid = identity.uid;
    } catch (err) {
      if (err instanceof AccountConflictError) {
        res.status(409).json({
          error: 'This email belongs to an account created before the Firebase migration.',
          code: 'LEGACY_ACCOUNT',
        });
        return;
      }
      next(err);
      return;
    }
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  next();
}
