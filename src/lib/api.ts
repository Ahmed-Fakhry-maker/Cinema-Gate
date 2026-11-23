import { firebaseAuth } from './firebase.ts';
import type { FilmDetail, FilmSummary, ReviewItem, User, WatchlistEntry } from '../types/cinema.ts';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  // The SDK returns a cached token and refreshes it shortly before expiry.
  const idToken = await firebaseAuth.currentUser?.getIdToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...(options?.headers ?? {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!res.ok) {
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.code);
  }
  return data;
}

export const api = {
  getMe: () => request<{ user: User | null }>('/api/auth/me'),

  getFilms: (params?: { genre?: string; q?: string; sort?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params?.genre && params.genre !== 'All') query.set('genre', params.genre);
    if (params?.q) query.set('q', params.q);
    if (params?.sort) query.set('sort', params.sort);
    if (params?.page && params.page > 1) query.set('page', String(params.page));
    const qs = query.toString();
    return request<{ films: FilmSummary[]; genres: string[]; page: number; totalPages: number }>(
      `/api/films${qs ? `?${qs}` : ''}`,
    );
  },

  getFilmDetail: (slug: string) => request<{ film: FilmDetail }>(`/api/films/${encodeURIComponent(slug)}`),

  saveReview: (slug: string, payload: { rating: number; comment: string }) =>
    request<{ averageRating: number | null; reviewCount: number; review: ReviewItem }>(
      `/api/films/${encodeURIComponent(slug)}/review`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),

  deleteReview: (slug: string) =>
    request<{ ok: boolean; averageRating: number | null; reviewCount: number }>(
      `/api/films/${encodeURIComponent(slug)}/review`,
      {
        method: 'DELETE',
      },
    ),

  getWatchlist: () => request<{ watchlist: WatchlistEntry[] }>('/api/watchlist'),

  addToWatchlist: (slug: string) =>
    request<{ inWatchlist: boolean }>(`/api/watchlist/${encodeURIComponent(slug)}`, {
      method: 'POST',
    }),

  removeFromWatchlist: (slug: string) =>
    request<{ inWatchlist: boolean }>(`/api/watchlist/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    }),
};
