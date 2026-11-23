import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { TmdbMovieRecord } from './tmdb.ts';

export function createDatabase(dbPath?: string): DatabaseSync {
  const resolvedPath = dbPath ?? process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'cinema.db');
  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }
  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (resolvedPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  initializeSchema(db);
  return db;
}

export function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS films (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id INTEGER UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      release_year INTEGER NOT NULL,
      genre TEXT NOT NULL,
      genres_json TEXT NOT NULL DEFAULT '[]',
      director TEXT NOT NULL,
      runtime_minutes INTEGER NOT NULL,
      country TEXT NOT NULL,
      plot_brief TEXT NOT NULL,
      poster_url TEXT NOT NULL,
      backdrop_url TEXT,
      tagline TEXT,
      tmdb_rating REAL,
      tmdb_vote_count INTEGER NOT NULL DEFAULT 0,
      editorial_quote TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      film_id INTEGER NOT NULL REFERENCES films(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(film_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      film_id INTEGER NOT NULL REFERENCES films(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, film_id)
    );
  `);

  // Users now authenticate through Firebase; link each row to its Firebase uid.
  const userCols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!userCols.some((c) => c.name === 'firebase_uid')) {
    db.exec('ALTER TABLE users ADD COLUMN firebase_uid TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)');

  // Ensure older database instances gain new TMDB columns without data loss
  const columns = db.prepare('PRAGMA table_info(films)').all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));

  const migrations: Array<[string, string]> = [
    ['tmdb_id', 'ALTER TABLE films ADD COLUMN tmdb_id INTEGER'],
    ['genres_json', "ALTER TABLE films ADD COLUMN genres_json TEXT NOT NULL DEFAULT '[]'"],
    ['backdrop_url', 'ALTER TABLE films ADD COLUMN backdrop_url TEXT'],
    ['tagline', 'ALTER TABLE films ADD COLUMN tagline TEXT'],
    ['tmdb_rating', 'ALTER TABLE films ADD COLUMN tmdb_rating REAL'],
    ['tmdb_vote_count', 'ALTER TABLE films ADD COLUMN tmdb_vote_count INTEGER NOT NULL DEFAULT 0'],
  ];

  for (const [col, sql] of migrations) {
    if (!colNames.has(col)) {
      db.exec(sql);
    }
  }
}

export function upsertFilmFromTmdb(db: DatabaseSync, movie: TmdbMovieRecord): number {
  const genresJson = JSON.stringify(movie.genres);
  const existing = db
    .prepare('SELECT id FROM films WHERE tmdb_id = ? OR slug = ?')
    .get(movie.tmdbId, movie.slug) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `
      UPDATE films
      SET tmdb_id = ?,
          slug = ?,
          title = ?,
          release_year = ?,
          genre = ?,
          genres_json = ?,
          director = ?,
          runtime_minutes = ?,
          country = ?,
          plot_brief = ?,
          poster_url = ?,
          backdrop_url = ?,
          tagline = ?,
          tmdb_rating = ?,
          tmdb_vote_count = ?
      WHERE id = ?
    `,
    ).run(
      movie.tmdbId,
      movie.slug,
      movie.title,
      movie.releaseYear,
      movie.genre,
      genresJson,
      movie.director,
      movie.runtimeMinutes,
      movie.country,
      movie.plotBrief,
      movie.posterUrl,
      movie.backdropUrl,
      movie.tagline,
      movie.tmdbRating,
      movie.tmdbVoteCount,
      existing.id,
    );
    return existing.id;
  }

  const inserted = db
    .prepare(
      `
      INSERT INTO films (
        tmdb_id, slug, title, release_year, genre, genres_json,
        director, runtime_minutes, country, plot_brief, poster_url,
        backdrop_url, tagline, tmdb_rating, tmdb_vote_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      movie.tmdbId,
      movie.slug,
      movie.title,
      movie.releaseYear,
      movie.genre,
      genresJson,
      movie.director,
      movie.runtimeMinutes,
      movie.country,
      movie.plotBrief,
      movie.posterUrl,
      movie.backdropUrl,
      movie.tagline,
      movie.tmdbRating,
      movie.tmdbVoteCount,
    );

  return Number(inserted.lastInsertRowid);
}
