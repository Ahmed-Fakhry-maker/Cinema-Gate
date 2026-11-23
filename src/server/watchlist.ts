import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { DatabaseSync } from 'node:sqlite';
import { FIREBASE_PROJECT_ID } from './auth.ts';

/** One saved film. `filmKey` is the film's TMDB id (its local id for legacy rows without one), as a string. */
export interface WatchlistRecord {
  filmKey: string;
  addedAt: string;
}

/** Per-user watchlist storage, keyed by Firebase uid. */
export interface WatchlistStore {
  /** Newest first. */
  list(uid: string): Promise<WatchlistRecord[]>;
  /** No-op when the film is already saved, so the original `addedAt` is kept. */
  add(uid: string, filmKey: string, addedAt?: string): Promise<void>;
  remove(uid: string, filmKey: string): Promise<void>;
}

const ALREADY_EXISTS = 6; // gRPC status code from Firestore create()

/**
 * Stores each entry at users/{uid}/watchlist/{filmKey}. Uses the Admin SDK, so the server needs
 * Google credentials (GOOGLE_APPLICATION_CREDENTIALS, or FIRESTORE_EMULATOR_HOST for local dev).
 * The client never touches Firestore; see firestore.rules.
 */
export function createFirestoreWatchlistStore(): WatchlistStore {
  let cached: ReturnType<typeof getFirestore> | undefined;
  // Lazy so the app still boots (and signed-out browsing works) without Firestore credentials.
  const entries = (uid: string) => {
    cached ??= getFirestore(getApps()[0] ?? initializeApp({ projectId: FIREBASE_PROJECT_ID }));
    return cached.collection('users').doc(uid).collection('watchlist');
  };

  return {
    async list(uid) {
      const snap = await entries(uid).orderBy('addedAt', 'desc').get();
      return snap.docs.map((d) => ({ filmKey: d.id, addedAt: String(d.get('addedAt')) }));
    },
    async add(uid, filmKey, addedAt = new Date().toISOString()) {
      try {
        await entries(uid).doc(filmKey).create({ addedAt });
      } catch (err) {
        if ((err as { code?: number }).code !== ALREADY_EXISTS) throw err;
      }
    },
    async remove(uid, filmKey) {
      await entries(uid).doc(filmKey).delete();
    },
  };
}

/** In-memory store for tests. */
export function createMemoryWatchlistStore(): WatchlistStore {
  const data = new Map<string, Map<string, string>>();
  return {
    async list(uid) {
      return [...(data.get(uid) ?? [])]
        .map(([filmKey, addedAt]) => ({ filmKey, addedAt }))
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    },
    async add(uid, filmKey, addedAt = new Date().toISOString()) {
      const user = data.get(uid) ?? new Map<string, string>();
      if (!user.has(filmKey)) user.set(filmKey, addedAt);
      data.set(uid, user);
    },
    async remove(uid, filmKey) {
      data.get(uid)?.delete(filmKey);
    },
  };
}

/**
 * SQLite-backed watchlist store using the existing `watchlist` table in data/cinema.db.
 * Directly maps by user's Firebase UID and film's TMDB / local ID.
 */
export function createSqliteWatchlistStore(db: DatabaseSync): WatchlistStore {
  return {
    async list(uid: string): Promise<WatchlistRecord[]> {
      const rows = db
        .prepare(
          `SELECT COALESCE(f.tmdb_id, f.id) AS film_key, w.added_at
           FROM watchlist w
           JOIN users u ON u.id = w.user_id
           JOIN films f ON f.id = w.film_id
           WHERE u.firebase_uid = ?
           ORDER BY w.added_at DESC`,
        )
        .all(uid) as Array<{ film_key: number; added_at: string }>;

      return rows.map((r) => ({
        filmKey: String(r.film_key),
        addedAt: r.added_at.includes('T') ? r.added_at : new Date(`${r.added_at.replace(' ', 'T')}Z`).toISOString(),
      }));
    },

    async add(uid: string, filmKey: string, addedAt = new Date().toISOString()): Promise<void> {
      const user = db.prepare('SELECT id FROM users WHERE firebase_uid = ?').get(uid) as { id: number } | undefined;
      if (!user) return;

      const numericKey = Number(filmKey);
      const film = db
        .prepare('SELECT id FROM films WHERE tmdb_id = ? OR id = ?')
        .get(numericKey, numericKey) as { id: number } | undefined;
      if (!film) return;

      db.prepare(
        `INSERT OR IGNORE INTO watchlist (user_id, film_id, added_at)
         VALUES (?, ?, ?)`,
      ).run(user.id, film.id, addedAt);
    },

    async remove(uid: string, filmKey: string): Promise<void> {
      const user = db.prepare('SELECT id FROM users WHERE firebase_uid = ?').get(uid) as { id: number } | undefined;
      if (!user) return;

      const numericKey = Number(filmKey);
      const film = db
        .prepare('SELECT id FROM films WHERE tmdb_id = ? OR id = ?')
        .get(numericKey, numericKey) as { id: number } | undefined;
      if (!film) return;

      db.prepare('DELETE FROM watchlist WHERE user_id = ? AND film_id = ?').run(user.id, film.id);
    },
  };
}

/**
 * Automatically chooses the best store: uses Firestore if credentials or an emulator are available,
 * otherwise falls back cleanly to the local SQLite database.
 */
export function createAutoWatchlistStore(db: DatabaseSync): WatchlistStore {
  const sqlite = createSqliteWatchlistStore(db);
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIRESTORE_EMULATOR_HOST) {
    return sqlite;
  }

  const firestore = createFirestoreWatchlistStore();
  let firestoreDisabled = false;

  return {
    async list(uid) {
      if (firestoreDisabled) return sqlite.list(uid);
      try {
        return await firestore.list(uid);
      } catch (err) {
        console.warn('Firestore watchlist lookup failed, falling back to SQLite:', err);
        firestoreDisabled = true;
        return sqlite.list(uid);
      }
    },
    async add(uid, filmKey, addedAt) {
      if (firestoreDisabled) return sqlite.add(uid, filmKey, addedAt);
      try {
        await firestore.add(uid, filmKey, addedAt);
      } catch (err) {
        console.warn('Firestore watchlist add failed, falling back to SQLite:', err);
        firestoreDisabled = true;
        await sqlite.add(uid, filmKey, addedAt);
      }
    },
    async remove(uid, filmKey) {
      if (firestoreDisabled) return sqlite.remove(uid, filmKey);
      try {
        await firestore.remove(uid, filmKey);
      } catch (err) {
        console.warn('Firestore watchlist remove failed, falling back to SQLite:', err);
        firestoreDisabled = true;
        await sqlite.remove(uid, filmKey);
      }
    },
  };
}

/**
 * One-time copy of the legacy SQLite `watchlist` table into the store. Idempotent: re-running
 * never overwrites existing entries. Rows whose user has no Firebase uid (pre-migration
 * accounts that never signed in via Firebase) cannot be mapped and are counted as skipped.
 */
export async function migrateSqliteWatchlist(
  db: DatabaseSync,
  store: WatchlistStore,
): Promise<{ copied: number; skipped: number }> {
  const rows = db
    .prepare(
      `SELECT u.firebase_uid AS uid, COALESCE(f.tmdb_id, f.id) AS film_key, w.added_at
       FROM watchlist w
       JOIN users u ON u.id = w.user_id
       JOIN films f ON f.id = w.film_id`,
    )
    .all() as Array<{ uid: string | null; film_key: number; added_at: string }>;

  let copied = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.uid) {
      skipped++;
      continue;
    }
    // SQLite datetime() is "YYYY-MM-DD HH:MM:SS" UTC; store ISO so ordering matches new entries.
    await store.add(row.uid, String(row.film_key), new Date(`${row.added_at.replace(' ', 'T')}Z`).toISOString());
    copied++;
  }
  return { copied, skipped };
}
