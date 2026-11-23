import express from 'express';
import helmet from 'helmet';
import type { DatabaseSync } from 'node:sqlite';
import {
  attachAuthUser,
  createFirebaseVerifier,
  requireAuth,
  type AuthenticatedRequest,
  type IdTokenVerifier,
} from './auth.ts';
import { upsertFilmFromTmdb } from './db.ts';
import { createAutoWatchlistStore, type WatchlistStore } from './watchlist.ts';
import { createTmdbClient, TmdbApiError, type TmdbClient, type TmdbMovieRecord } from './tmdb.ts';
import type { FilmDetail, FilmSummary, ReviewItem, WatchlistEntry } from '../types/cinema.ts';

interface StoredFilmRow {
  id: number;
  tmdb_id: number | null;
  slug: string;
  title: string;
  release_year: number;
  genre: string;
  genres_json: string;
  director: string;
  runtime_minutes: number;
  country: string;
  plot_brief: string;
  poster_url: string;
  backdrop_url: string | null;
  tagline: string | null;
  tmdb_rating: number | null;
  tmdb_vote_count: number;
  average_rating: number | null;
  review_count: number;
  in_watchlist: number;
}

function parseGenresJson(raw: string | undefined, fallbackGenre: string): string[] {
  if (!raw) return [fallbackGenre];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // Ignore invalid JSON
  }
  return [fallbackGenre];
}

function mapStoredFilmRow(row: StoredFilmRow): FilmSummary {
  return {
    id: row.id,
    tmdbId: row.tmdb_id ?? row.id,
    slug: row.slug,
    title: row.title,
    releaseYear: row.release_year,
    genre: row.genre,
    genres: parseGenresJson(row.genres_json, row.genre),
    director: row.director,
    runtimeMinutes: row.runtime_minutes,
    country: row.country,
    plotBrief: row.plot_brief,
    posterUrl: row.poster_url,
    backdropUrl: row.backdrop_url,
    tagline: row.tagline,
    tmdbRating: row.tmdb_rating !== null ? Number(Number(row.tmdb_rating).toFixed(1)) : null,
    tmdbVoteCount: Number(row.tmdb_vote_count ?? 0),
    averageRating: row.average_rating !== null ? Number(Number(row.average_rating).toFixed(1)) : null,
    reviewCount: Number(row.review_count),
    inWatchlist: Boolean(row.in_watchlist),
  };
}

function handleApiError(res: express.Response, err: unknown, fallbackMessage: string): void {
  if (err instanceof TmdbApiError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const message = err instanceof Error ? err.message : fallbackMessage;
  res.status(500).json({ error: message, code: 'INTERNAL_ERROR' });
}

export function createApp(
  db: DatabaseSync,
  options?: { tmdbClient?: TmdbClient; verifyIdToken?: IdTokenVerifier; watchlistStore?: WatchlistStore },
): express.Express {
  const tmdb = options?.tmdbClient ?? createTmdbClient();
  const watchlist = options?.watchlistStore ?? createAutoWatchlistStore(db);
  const app = express();
  // CSP is production-only: the Vite dev server relies on inline scripts and HMR websockets.
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ['https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https://image.tmdb.org'],
                connectSrc: ["'self'", 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com'],
              },
            }
          : false,
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(attachAuthUser(db, options?.verifyIdToken ?? createFirebaseVerifier()));

  async function ensureFilmRecord(slugOrId: string): Promise<{ dbFilmId: number; tmdbMovie?: TmdbMovieRecord } | null> {
    const numericId = Number(slugOrId);
    if (Number.isInteger(numericId) && numericId > 0) {
      try {
        const tmdbMovie = await tmdb.getMovieDetail(numericId);
        const dbFilmId = upsertFilmFromTmdb(db, tmdbMovie);
        return { dbFilmId, tmdbMovie };
      } catch (err) {
        if (err instanceof TmdbApiError && err.code === 'TMDB_NOT_FOUND') {
          return null;
        }
        const existing = db
          .prepare('SELECT id FROM films WHERE tmdb_id = ? OR slug = ?')
          .get(numericId, slugOrId) as { id: number } | undefined;
        if (existing) {
          return { dbFilmId: existing.id };
        }
        throw err;
      }
    }

    const existing = db.prepare('SELECT id FROM films WHERE slug = ?').get(slugOrId) as { id: number } | undefined;
    return existing ? { dbFilmId: existing.id } : null;
  }

  /** Film keys the signed-in user saved; empty when signed out or Firestore is unreachable. */
  async function loadWatchlistKeys(uid: string | undefined): Promise<Set<string>> {
    if (!uid) return new Set();
    try {
      return new Set((await watchlist.list(uid)).map((e) => e.filmKey));
    } catch (err) {
      console.error('Watchlist lookup failed; showing films as not saved:', err);
      return new Set();
    }
  }

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Auth: Current user (sign-up/login/logout now happen in the browser via Firebase)
  app.get('/api/auth/me', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    res.json({ user: authReq.user ?? null });
  });

  // Films: Browse TMDB catalogue overlaid with Cinema Gate member ratings & watchlist state
  app.get('/api/films', async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const savedKeys = await loadWatchlistKeys(authReq.firebaseUid);

    const genre = typeof req.query.genre === 'string' ? req.query.genre.trim() : '';
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rawSort = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'popular';
    const sort: 'rating' | 'popular' | 'year' | 'title' =
      rawSort === 'rating' || rawSort === 'year' || rawSort === 'title' ? rawSort : 'popular';
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);

    try {
      const result = await tmdb.browseMovies({ genre, q: search, sort, page });

      const tmdbIds = result.movies.map((m) => m.tmdbId);
      const localStats = new Map<
        number,
        { id: number; averageRating: number | null; reviewCount: number }
      >();

      if (tmdbIds.length > 0) {
        const placeholders = tmdbIds.map(() => '?').join(',');
        const rows = db
          .prepare(
            `
            SELECT
              f.id,
              f.tmdb_id,
              AVG(r.rating) AS average_rating,
              COUNT(r.id) AS review_count
            FROM films f
            LEFT JOIN reviews r ON r.film_id = f.id
            WHERE f.tmdb_id IN (${placeholders})
            GROUP BY f.id
          `,
          )
          .all(...tmdbIds) as Array<{
          id: number;
          tmdb_id: number;
          average_rating: number | null;
          review_count: number;
        }>;

        for (const row of rows) {
          localStats.set(row.tmdb_id, {
            id: row.id,
            averageRating:
              row.average_rating !== null ? Number(Number(row.average_rating).toFixed(1)) : null,
            reviewCount: Number(row.review_count),
          });
        }
      }

      const films: FilmSummary[] = result.movies.map((movie) => {
        const stats = localStats.get(movie.tmdbId);
        return {
          id: stats?.id ?? movie.tmdbId,
          tmdbId: movie.tmdbId,
          slug: movie.slug,
          title: movie.title,
          releaseYear: movie.releaseYear,
          genre: movie.genre,
          genres: movie.genres,
          director: movie.director,
          runtimeMinutes: movie.runtimeMinutes,
          country: movie.country,
          plotBrief: movie.plotBrief,
          posterUrl: movie.posterUrl,
          backdropUrl: movie.backdropUrl,
          tagline: movie.tagline,
          tmdbRating: movie.tmdbRating,
          tmdbVoteCount: movie.tmdbVoteCount,
          averageRating: stats?.averageRating ?? null,
          reviewCount: stats?.reviewCount ?? 0,
          inWatchlist: savedKeys.has(String(movie.tmdbId)),
        };
      });

      res.json({
        films,
        genres: result.genres.map((g) => g.name),
        page: result.page,
        totalPages: result.totalPages,
      });
    } catch (err) {
      handleApiError(res, err, 'Unable to load movies from TMDB.');
    }
  });

  // Films: Single film detail + Cinema Gate reviews
  app.get('/api/films/:slug', async (req, res) => {
    const authReq = req as unknown as AuthenticatedRequest;
    const userId = authReq.user?.id ?? -1;
    const slug = req.params.slug;
    const savedKeys = await loadWatchlistKeys(authReq.firebaseUid);

    try {
      const resolved = await ensureFilmRecord(slug);
      if (!resolved) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      const filmRow = db
        .prepare(
          `
          SELECT
            f.id, f.tmdb_id, f.slug, f.title, f.release_year, f.genre, f.genres_json,
            f.director, f.runtime_minutes, f.country, f.plot_brief, f.poster_url,
            f.backdrop_url, f.tagline, f.tmdb_rating, f.tmdb_vote_count,
            AVG(r.rating) AS average_rating,
            COUNT(r.id) AS review_count,
            0 AS in_watchlist
          FROM films f
          LEFT JOIN reviews r ON r.film_id = f.id
          WHERE f.id = ?
          GROUP BY f.id
        `,
        )
        .get(resolved.dbFilmId) as StoredFilmRow | undefined;

      if (!filmRow) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }
      filmRow.in_watchlist = savedKeys.has(String(filmRow.tmdb_id ?? filmRow.id)) ? 1 : 0;

      const reviewRows = db
        .prepare(
          `
          SELECT
            r.id, r.film_id, r.rating, r.comment, r.created_at, r.updated_at,
            u.id AS author_id, u.name AS author_name
          FROM reviews r
          JOIN users u ON u.id = r.user_id
          WHERE r.film_id = ?
          ORDER BY r.updated_at DESC, r.id DESC
        `,
        )
        .all(filmRow.id) as Array<{
        id: number;
        film_id: number;
        rating: number;
        comment: string;
        created_at: string;
        updated_at: string;
        author_id: number;
        author_name: string;
      }>;

      const reviews: ReviewItem[] = reviewRows.map((row) => ({
        id: row.id,
        filmId: row.film_id,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        author: {
          id: row.author_id,
          name: row.author_name,
        },
        isOwner: row.author_id === userId,
      }));

      const detail: FilmDetail = {
        ...mapStoredFilmRow(filmRow),
        cast: resolved.tmdbMovie?.cast ?? [],
        reviews,
        userReview: reviews.find((r) => r.isOwner) ?? null,
      };

      res.json({ film: detail });
    } catch (err) {
      handleApiError(res, err, 'Unable to load movie details from TMDB.');
    }
  });

  // Reviews: Create or update user rating & review for a film
  app.put('/api/films/:slug/review', requireAuth, async (req, res) => {
    const authReq = req as unknown as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const slug = req.params.slug;

    try {
      const resolved = await ensureFilmRecord(slug);
      if (!resolved) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      const rating = Number(req.body?.rating);
      const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
        return;
      }
      if (comment.length < 3 || comment.length > 2000) {
        res.status(400).json({ error: 'Review must be between 3 and 2000 characters.' });
        return;
      }

      db.prepare(
        `
        INSERT INTO reviews (film_id, user_id, rating, comment, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(film_id, user_id) DO UPDATE SET
          rating = excluded.rating,
          comment = excluded.comment,
          updated_at = datetime('now')
      `,
      ).run(resolved.dbFilmId, userId, rating, comment);

      const summary = db
        .prepare('SELECT AVG(rating) AS average_rating, COUNT(id) AS review_count FROM reviews WHERE film_id = ?')
        .get(resolved.dbFilmId) as { average_rating: number | null; review_count: number };

      const saved = db
        .prepare(
          `
          SELECT r.id, r.film_id, r.rating, r.comment, r.created_at, r.updated_at,
                 u.id AS author_id, u.name AS author_name
          FROM reviews r
          JOIN users u ON u.id = r.user_id
          WHERE r.film_id = ? AND r.user_id = ?
        `,
        )
        .get(resolved.dbFilmId, userId) as {
        id: number;
        film_id: number;
        rating: number;
        comment: string;
        created_at: string;
        updated_at: string;
        author_id: number;
        author_name: string;
      };

      res.json({
        averageRating: summary.average_rating !== null ? Number(Number(summary.average_rating).toFixed(1)) : null,
        reviewCount: Number(summary.review_count),
        review: {
          id: saved.id,
          filmId: saved.film_id,
          rating: saved.rating,
          comment: saved.comment,
          createdAt: saved.created_at,
          updatedAt: saved.updated_at,
          author: { id: saved.author_id, name: saved.author_name },
          isOwner: true,
        },
      });
    } catch (err) {
      handleApiError(res, err, 'Unable to save review.');
    }
  });

  // Reviews: Delete authenticated user's review
  app.delete('/api/films/:slug/review', requireAuth, (req, res) => {
    const authReq = req as unknown as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const slug = req.params.slug;
    const numericId = Number(slug);

    const film = db
      .prepare('SELECT id FROM films WHERE slug = ? OR tmdb_id = ?')
      .get(slug, Number.isInteger(numericId) ? numericId : -1) as { id: number } | undefined;

    if (!film) {
      res.status(404).json({ error: 'Movie not found.' });
      return;
    }

    const result = db.prepare('DELETE FROM reviews WHERE film_id = ? AND user_id = ?').run(film.id, userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'No review found to delete.' });
      return;
    }

    const summary = db
      .prepare('SELECT AVG(rating) AS average_rating, COUNT(id) AS review_count FROM reviews WHERE film_id = ?')
      .get(film.id) as { average_rating: number | null; review_count: number };

    res.json({
      ok: true,
      averageRating: summary.average_rating !== null ? Number(Number(summary.average_rating).toFixed(1)) : null,
      reviewCount: Number(summary.review_count),
    });
  });

  // Watchlist: Get user's personal watchlist (stored in Firestore, joined with locally cached film data)
  app.get('/api/watchlist', requireAuth, async (req, res) => {
    const uid = (req as AuthenticatedRequest).firebaseUid!;

    try {
      const saved = await watchlist.list(uid);
      const keys = saved.map((e) => e.filmKey);

      const loadRows = () =>
        keys.length === 0
          ? []
          : (db
              .prepare(
                `
        SELECT
          f.id, f.tmdb_id, f.slug, f.title, f.release_year, f.genre, f.genres_json,
          f.director, f.runtime_minutes, f.country, f.plot_brief, f.poster_url,
          f.backdrop_url, f.tagline, f.tmdb_rating, f.tmdb_vote_count,
          AVG(r.rating) AS average_rating,
          COUNT(r.id) AS review_count,
          1 AS in_watchlist
        FROM films f
        LEFT JOIN reviews r ON r.film_id = f.id
        WHERE COALESCE(f.tmdb_id, f.id) IN (${keys.map(() => '?').join(',')})
        GROUP BY f.id
      `,
              )
              .all(...keys.map(Number)) as unknown as StoredFilmRow[]);

      let rows = loadRows();

      // Entries can outlive the local film cache (e.g. a fresh SQLite file): re-fetch those from TMDB.
      const cached = new Set(rows.map((r) => String(r.tmdb_id ?? r.id)));
      const missing = keys.filter((k) => !cached.has(k));
      if (missing.length > 0) {
        await Promise.allSettled(missing.map((k) => ensureFilmRecord(k)));
        rows = loadRows();
      }

      const byKey = new Map(rows.map((r) => [String(r.tmdb_id ?? r.id), r]));
      const items: WatchlistEntry[] = saved.flatMap((entry) => {
        const row = byKey.get(entry.filmKey);
        return row ? [{ ...mapStoredFilmRow(row), addedAt: entry.addedAt }] : [];
      });

      res.json({ watchlist: items });
    } catch (err) {
      handleApiError(res, err, 'Unable to load watchlist.');
    }
  });

  // Watchlist: Add film
  app.post('/api/watchlist/:slug', requireAuth, async (req, res) => {
    const uid = (req as AuthenticatedRequest).firebaseUid!;
    const slug = req.params.slug;

    try {
      const resolved = await ensureFilmRecord(slug);
      if (!resolved) {
        res.status(404).json({ error: 'Movie not found.' });
        return;
      }

      const { key } = db
        .prepare('SELECT COALESCE(tmdb_id, id) AS key FROM films WHERE id = ?')
        .get(resolved.dbFilmId) as { key: number };
      await watchlist.add(uid, String(key));
      res.status(201).json({ inWatchlist: true });
    } catch (err) {
      handleApiError(res, err, 'Unable to update watchlist.');
    }
  });

  // Watchlist: Remove film
  app.delete('/api/watchlist/:slug', requireAuth, async (req, res) => {
    const uid = (req as AuthenticatedRequest).firebaseUid!;
    const slug = req.params.slug;
    const numericId = Number(slug);

    const film = db
      .prepare('SELECT COALESCE(tmdb_id, id) AS key FROM films WHERE slug = ? OR tmdb_id = ?')
      .get(slug, Number.isInteger(numericId) ? numericId : -1) as { key: number } | undefined;

    if (!film) {
      res.status(404).json({ error: 'Movie not found.' });
      return;
    }

    try {
      await watchlist.remove(uid, String(film.key));
      res.json({ inWatchlist: false });
    } catch (err) {
      handleApiError(res, err, 'Unable to update watchlist.');
    }
  });

  return app;
}
