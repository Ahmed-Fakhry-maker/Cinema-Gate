import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type http from 'node:http';
import { createApp } from '../src/server/app.ts';
import type { IdTokenVerifier } from '../src/server/auth.ts';
import { createDatabase } from '../src/server/db.ts';
import { createMemoryWatchlistStore, migrateSqliteWatchlist } from '../src/server/watchlist.ts';
import {
  createTmdbClient,
  TMDB_API_KEY_PLACEHOLDER,
  TmdbApiError,
  type TmdbClient,
  type TmdbMovieRecord,
} from '../src/server/tmdb.ts';

const MOCK_MOVIES: TmdbMovieRecord[] = [
  {
    tmdbId: 550,
    slug: '550',
    title: 'Fight Club',
    releaseYear: 1999,
    genre: 'Drama',
    genres: ['Drama', 'Thriller'],
    director: 'David Fincher',
    runtimeMinutes: 139,
    country: 'United States of America',
    plotBrief: 'An insomniac office worker and a devil-may-care soap maker form an underground fight club.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/hZkgoQYus5vegHoetLkCJzb17zJ.jpg',
    tagline: 'Mischief. Mayhem. Soap.',
    tmdbRating: 8.4,
    tmdbVoteCount: 28000,
    cast: [{ id: 819, name: 'Edward Norton', character: 'The Narrator' }],
  },
  {
    tmdbId: 27205,
    slug: '27205',
    title: 'Inception',
    releaseYear: 2010,
    genre: 'Sci-Fi',
    genres: ['Sci-Fi', 'Action'],
    director: 'Christopher Nolan',
    runtimeMinutes: 148,
    country: 'United States of America',
    plotBrief: 'A thief who steals corporate secrets through dream-sharing technology is tasked with planting an idea.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/s3TBrRGB1iav7gFOCNx3H31MoES.jpg',
    tagline: 'Your mind is the scene of the crime.',
    tmdbRating: 8.4,
    tmdbVoteCount: 35000,
    cast: [{ id: 6193, name: 'Leonardo DiCaprio', character: 'Dom Cobb' }],
  },
];

function createStubTmdbClient(): TmdbClient {
  return {
    async getGenres() {
      return [
        { id: 18, name: 'Drama' },
        { id: 878, name: 'Sci-Fi' },
      ];
    },
    async browseMovies() {
      return {
        movies: MOCK_MOVIES,
        genres: [
          { id: 18, name: 'Drama' },
          { id: 878, name: 'Sci-Fi' },
        ],
        page: 1,
        totalPages: 1,
      };
    },
    async getMovieDetail(movieId: number) {
      const found = MOCK_MOVIES.find((m) => m.tmdbId === movieId);
      if (!found) {
        throw new TmdbApiError('TMDB_NOT_FOUND', 404, 'Movie not found on TMDB.');
      }
      return found;
    },
  };
}

// Stand-in for Firebase: a token is "uid|email|name"; anything else is rejected like an invalid ID token.
const fakeVerifier: IdTokenVerifier = async (token) => {
  const [uid, email, name] = token.split('|');
  if (!uid || !email) throw new Error('invalid token');
  return { uid, email, name: name || null };
};
const ELENA = 'uid-elena|elena@cinemagate.example|Elena Rostova';
const MARCUS = 'uid-marcus|marcus@cinemagate.example|Marcus Vance';

describe('TMDB API Client Conventions', () => {
  it('rejects placeholder key with TMDB_KEY_MISSING', async () => {
    const client = createTmdbClient({ apiKey: TMDB_API_KEY_PLACEHOLDER });
    await assert.rejects(
      () => client.browseMovies({}),
      (err: unknown) => err instanceof TmdbApiError && err.code === 'TMDB_KEY_MISSING' && err.status === 503,
    );
  });

  it('sends documented TMDB headers, auth, and constructs image URLs from /3/configuration', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, headers });

      if (url.includes('/3/configuration')) {
        return new Response(
          JSON.stringify({
            images: {
              secure_base_url: 'https://image.tmdb.org/t/p/',
              poster_sizes: ['w342', 'w500', 'original'],
              backdrop_sizes: ['w780', 'w1280', 'original'],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/3/genre/movie/list')) {
        return new Response(JSON.stringify({ genres: [{ id: 18, name: 'Drama' }] }), { status: 200 });
      }
      if (url.includes('/3/movie/popular')) {
        return new Response(
          JSON.stringify({
            page: 1,
            total_pages: 1,
            results: [
              {
                id: 550,
                title: 'Fight Club',
                release_date: '1999-10-15',
                overview: 'Test overview.',
                poster_path: '/poster123.jpg',
                backdrop_path: null,
                genre_ids: [18],
                vote_average: 8.4,
                vote_count: 1000,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ status_message: 'Not found' }), { status: 404 });
    };

    const client = createTmdbClient({
      apiKey: 'eyJhbGciOiJIUzI1NiJ9.mock-v4-token.sig',
      fetchImpl: mockFetch,
    });

    const res = await client.browseMovies({ sort: 'popular' });
    assert.equal(res.movies.length, 1);
    assert.equal(res.movies[0].posterUrl, 'https://image.tmdb.org/t/p/w500/poster123.jpg');
    assert.equal(res.movies[0].backdropUrl, null);
    assert.ok(calls.every((c) => c.url.startsWith('https://api.themoviedb.org/3/')));
    assert.ok(calls.every((c) => c.headers.accept === 'application/json'));
    assert.ok(calls.every((c) => c.headers.Authorization === 'Bearer eyJhbGciOiJIUzI1NiJ9.mock-v4-token.sig'));
  });
});

describe('Cinema Gate Core Flows', () => {
  let server: http.Server;
  let baseUrl: string;
  let db: ReturnType<typeof createDatabase>;

  before(async () => {
    db = createDatabase(':memory:');
    const app = createApp(db, {
      tmdbClient: createStubTmdbClient(),
      verifyIdToken: fakeVerifier,
      watchlistStore: createMemoryWatchlistStore(),
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function apiFetch(path: string, options?: RequestInit & { token?: string }) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
    };
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });
    const body = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body };
  }

  it('requires authentication for reviews and watchlist mutations', async () => {
    const reviewRes = await apiFetch('/api/films/550/review', {
      method: 'PUT',
      body: JSON.stringify({ rating: 5, comment: 'Unforgettable atmosphere.' }),
    });
    assert.equal(reviewRes.status, 401);

    const watchlistRes = await apiFetch('/api/watchlist/550', {
      method: 'POST',
    });
    assert.equal(watchlistRes.status, 401);
  });

  it('allows browsing, signing in with Firebase, rating a TMDB film, and recalculating average rating', async () => {
    const browseRes = await apiFetch('/api/films');
    assert.equal(browseRes.status, 200);
    assert.equal((browseRes.body.films as unknown[]).length, 2);

    const token1 = ELENA;
    const me1 = await apiFetch('/api/auth/me', { token: token1 });
    assert.equal((me1.body.user as { name: string }).name, 'Elena Rostova');

    const put1 = await apiFetch('/api/films/550/review', {
      method: 'PUT',
      token: token1,
      body: JSON.stringify({
        rating: 5,
        comment: 'Razor-sharp editing and unforgettable tone.',
      }),
    });
    assert.equal(put1.status, 200);
    assert.equal(put1.body.averageRating, 5);
    assert.equal(put1.body.reviewCount, 1);

    const token2 = MARCUS;

    const put2 = await apiFetch('/api/films/550/review', {
      method: 'PUT',
      token: token2,
      body: JSON.stringify({
        rating: 3,
        comment: 'Bold premise with a polarizing final act.',
      }),
    });
    assert.equal(put2.status, 200);
    assert.equal(put2.body.averageRating, 4);
    assert.equal(put2.body.reviewCount, 2);

    const detail = await apiFetch('/api/films/550', { token: token1 });
    assert.equal(detail.status, 200);
    const film = detail.body.film as {
      title: string;
      backdropUrl: string;
      averageRating: number;
      reviews: unknown[];
    };
    assert.equal(film.title, 'Fight Club');
    assert.ok(film.backdropUrl.startsWith('https://image.tmdb.org/t/p/'));
    assert.equal(film.averageRating, 4);
    assert.equal(film.reviews.length, 2);
  });

  it('adds and removes TMDB films on a user personal watchlist without leaking to other users', async () => {
    const elenaToken = ELENA;
    const marcusToken = MARCUS;

    const add1 = await apiFetch('/api/watchlist/550', {
      method: 'POST',
      token: elenaToken,
    });
    assert.equal(add1.status, 201);
    assert.equal(add1.body.inWatchlist, true);

    const add2 = await apiFetch('/api/watchlist/27205', {
      method: 'POST',
      token: elenaToken,
    });
    assert.equal(add2.status, 201);

    const elenaList = await apiFetch('/api/watchlist', { token: elenaToken });
    assert.equal(elenaList.status, 200);
    assert.equal((elenaList.body.watchlist as unknown[]).length, 2);

    const marcusList = await apiFetch('/api/watchlist', { token: marcusToken });
    assert.equal(marcusList.status, 200);
    assert.equal((marcusList.body.watchlist as unknown[]).length, 0);

    const remove1 = await apiFetch('/api/watchlist/550', {
      method: 'DELETE',
      token: elenaToken,
    });
    assert.equal(remove1.status, 200);
    assert.equal(remove1.body.inWatchlist, false);

    const elenaAfter = await apiFetch('/api/watchlist', { token: elenaToken });
    const remaining = elenaAfter.body.watchlist as Array<{ slug: string }>;
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].slug, '27205');
  });

  it('migrates legacy SQLite watchlist rows into the store, skipping users without a Firebase uid', async () => {
    const legacyDb = createDatabase(':memory:');
    const film = legacyDb
      .prepare(
        `INSERT INTO films (tmdb_id, slug, title, release_year, genre, genres_json, director, runtime_minutes, country, plot_brief, poster_url)
         VALUES (550, '550', 'Fight Club', 1999, 'Drama', '["Drama"]', 'D', 139, 'US', 'p', 'u')`,
      )
      .run().lastInsertRowid;
    const linked = legacyDb
      .prepare("INSERT INTO users (name, email, password_hash, firebase_uid) VALUES ('A', 'a@x.example', '', 'uid-a')")
      .run().lastInsertRowid;
    const unlinked = legacyDb
      .prepare("INSERT INTO users (name, email, password_hash) VALUES ('B', 'b@x.example', 'x:y')")
      .run().lastInsertRowid;
    const add = legacyDb.prepare("INSERT INTO watchlist (user_id, film_id, added_at) VALUES (?, ?, '2024-05-01 10:30:00')");
    add.run(linked, film);
    add.run(unlinked, film);

    const store = createMemoryWatchlistStore();
    assert.deepEqual(await migrateSqliteWatchlist(legacyDb, store), { copied: 1, skipped: 1 });
    assert.deepEqual(await store.list('uid-a'), [{ filmKey: '550', addedAt: '2024-05-01T10:30:00.000Z' }]);

    // Re-running changes nothing.
    await migrateSqliteWatchlist(legacyDb, store);
    assert.equal((await store.list('uid-a')).length, 1);
  });

  it('keeps the original addedAt when a film is added twice', async () => {
    const store = createMemoryWatchlistStore();
    await store.add('u', '1', '2024-01-01T00:00:00.000Z');
    await store.add('u', '1', '2025-01-01T00:00:00.000Z');
    assert.deepEqual(await store.list('u'), [{ filmKey: '1', addedAt: '2024-01-01T00:00:00.000Z' }]);
  });

  it('treats invalid tokens as signed out and refuses to link a legacy account by email', async () => {
    const bad = await apiFetch('/api/watchlist', { token: 'not-a-firebase-token' });
    assert.equal(bad.status, 401);

    db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('Legacy', 'legacy@cinemagate.example', 'x:y')").run();
    const clash = await apiFetch('/api/auth/me', { token: 'uid-attacker|legacy@cinemagate.example|Mallory' });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.code, 'LEGACY_ACCOUNT');
  });
});
