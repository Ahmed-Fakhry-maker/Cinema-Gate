import type { CastMember, GenreOption } from '../types/cinema.ts';

/**
 * TMDB API configuration.
 * Replace YOUR_TMDB_API_KEY in .env (TMDB_API_KEY) or update the fallback below
 * with your TMDB v3 API Key or v4 Read Access Token.
 */
export const TMDB_BASE_URL = 'https://api.themoviedb.org';
export const TMDB_API_VERSION = '3';
export const TMDB_API_KEY_PLACEHOLDER = 'YOUR_TMDB_API_KEY';

const DEFAULT_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';
const CONFIG_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

export type TmdbErrorCode = 'TMDB_KEY_MISSING' | 'TMDB_UNAUTHORIZED' | 'TMDB_NOT_FOUND' | 'TMDB_REQUEST_FAILED';

export class TmdbApiError extends Error {
  code: TmdbErrorCode;
  status: number;

  constructor(code: TmdbErrorCode, status: number, message: string) {
    super(message);
    this.name = 'TmdbApiError';
    this.code = code;
    this.status = status;
  }
}

export interface TmdbMovieRecord {
  tmdbId: number;
  slug: string;
  title: string;
  releaseYear: number;
  genre: string;
  genres: string[];
  director: string;
  runtimeMinutes: number;
  country: string;
  plotBrief: string;
  posterUrl: string;
  backdropUrl: string | null;
  tagline: string | null;
  tmdbRating: number | null;
  tmdbVoteCount: number;
  cast?: CastMember[];
}

export interface TmdbBrowseResult {
  movies: TmdbMovieRecord[];
  genres: GenreOption[];
  page: number;
  totalPages: number;
}

export interface TmdbClient {
  getGenres(): Promise<GenreOption[]>;
  browseMovies(params: {
    genre?: string;
    q?: string;
    sort?: 'rating' | 'popular' | 'year' | 'title';
    page?: number;
  }): Promise<TmdbBrowseResult>;
  getMovieDetail(movieId: number): Promise<TmdbMovieRecord>;
}

interface TmdbConfigurationResponse {
  images?: {
    base_url?: string;
    secure_base_url?: string;
    poster_sizes?: string[];
    backdrop_sizes?: string[];
  };
}

interface TmdbGenreListResponse {
  genres?: Array<{ id: number; name: string }>;
}

interface TmdbRawMovieListItem {
  id: number;
  title?: string;
  overview?: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
}

interface TmdbMovieListResponse {
  page?: number;
  total_pages?: number;
  results?: TmdbRawMovieListItem[];
}

interface TmdbRawMovieDetail {
  id: number;
  title?: string;
  tagline?: string | null;
  overview?: string;
  release_date?: string;
  runtime?: number | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  vote_average?: number;
  vote_count?: number;
  credits?: {
    cast?: Array<{ id: number; name: string; character?: string }>;
    crew?: Array<{ id: number; name: string; job?: string }>;
  };
}

function parseReleaseYear(releaseDate?: string): number {
  if (!releaseDate || releaseDate.length < 4) return 0;
  const parsed = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickSize(availableSizes: string[] | undefined, preferred: string[], fallback: string): string {
  if (!availableSizes || availableSizes.length === 0) return fallback;
  for (const candidate of preferred) {
    if (availableSizes.includes(candidate)) return candidate;
  }
  return availableSizes[availableSizes.length - 1] || fallback;
}

function buildTmdbImageUrl(
  baseUrl: string,
  size: string,
  filePath: string | null | undefined,
): string | null {
  if (!filePath) return null;
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return `${normalizedBase}${size}${normalizedPath}`;
}

export function createTmdbClient(options?: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): TmdbClient {
  const fetchFn = options?.fetchImpl ?? fetch;

  let cachedConfig: {
    expiresAt: number;
    imageBaseUrl: string;
    posterSize: string;
    backdropSize: string;
  } | null = null;

  let cachedGenres: {
    expiresAt: number;
    genres: GenreOption[];
  } | null = null;

  function getActiveApiKey(): string {
    const env = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const key = (options?.apiKey ?? env?.TMDB_API_KEY ?? TMDB_API_KEY_PLACEHOLDER).trim();
    if (!key || key === TMDB_API_KEY_PLACEHOLDER) {
      throw new TmdbApiError(
        'TMDB_KEY_MISSING',
        503,
        `TMDB API key is not configured. Replace "${TMDB_API_KEY_PLACEHOLDER}" in your .env file (TMDB_API_KEY) with a valid TMDB API key or Read Access Token.`,
      );
    }
    return key;
  }

  async function tmdbFetch<T>(endpointPath: string, queryParams?: Record<string, string | number | undefined>): Promise<T> {
    const apiKey = getActiveApiKey();
    const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
    const url = new URL(`${TMDB_BASE_URL}/${TMDB_API_VERSION}${cleanPath}`);

    if (queryParams) {
      for (const [k, v] of Object.entries(queryParams)) {
        if (v !== undefined && v !== '') {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      accept: 'application/json',
    };

    // TMDB supports v4 Read Access Token (JWT) in Authorization header or v3 api_key query param.
    if (apiKey.includes('.')) {
      headers.Authorization = `Bearer ${apiKey}`;
    } else {
      url.searchParams.set('api_key', apiKey);
    }

    let response: Response;
    try {
      response = await fetchFn(url.toString(), { method: 'GET', headers });
    } catch {
      throw new TmdbApiError(
        'TMDB_REQUEST_FAILED',
        502,
        'Unable to reach The Movie Database (TMDB). Check your network connection and try again.',
      );
    }

    if (!response.ok) {
      let tmdbMessage = `TMDB responded with HTTP ${response.status}.`;
      try {
        const payload = (await response.json()) as { status_message?: string };
        if (payload.status_message) {
          tmdbMessage = payload.status_message;
        }
      } catch {
        // Ignore JSON parse error on non-JSON error bodies
      }

      if (response.status === 401 || response.status === 403) {
        throw new TmdbApiError(
          'TMDB_UNAUTHORIZED',
          401,
          `TMDB rejected the API credentials (${tmdbMessage}). Verify TMDB_API_KEY in .env.`,
        );
      }
      if (response.status === 404) {
        throw new TmdbApiError('TMDB_NOT_FOUND', 404, 'The requested movie was not found on TMDB.');
      }
      throw new TmdbApiError('TMDB_REQUEST_FAILED', 502, `TMDB API error: ${tmdbMessage}`);
    }

    return (await response.json()) as T;
  }

  async function getImageConfig(): Promise<{
    imageBaseUrl: string;
    posterSize: string;
    backdropSize: string;
  }> {
    if (cachedConfig && Date.now() < cachedConfig.expiresAt) {
      return cachedConfig;
    }

    try {
      const config = await tmdbFetch<TmdbConfigurationResponse>('/configuration');
      const rawBase = config.images?.secure_base_url || config.images?.base_url || DEFAULT_IMAGE_BASE_URL;
      const imageBaseUrl = rawBase.startsWith('http://') ? rawBase.replace('http://', 'https://') : rawBase;
      const posterSize = pickSize(config.images?.poster_sizes, ['w500', 'w780', 'w342', 'original'], 'w500');
      const backdropSize = pickSize(config.images?.backdrop_sizes, ['w1280', 'original', 'w780'], 'w1280');

      cachedConfig = {
        expiresAt: Date.now() + CONFIG_TTL_MS,
        imageBaseUrl,
        posterSize,
        backdropSize,
      };
      return cachedConfig;
    } catch (err) {
      // Rethrow auth/missing key errors immediately; fall back to documented TMDB defaults only on transient config hiccups
      if (err instanceof TmdbApiError && (err.code === 'TMDB_KEY_MISSING' || err.code === 'TMDB_UNAUTHORIZED')) {
        throw err;
      }
      return {
        imageBaseUrl: DEFAULT_IMAGE_BASE_URL,
        posterSize: 'w500',
        backdropSize: 'w1280',
      };
    }
  }

  async function getGenres(): Promise<GenreOption[]> {
    if (cachedGenres && Date.now() < cachedGenres.expiresAt) {
      return cachedGenres.genres;
    }

    const res = await tmdbFetch<TmdbGenreListResponse>('/genre/movie/list', { language: 'en-US' });
    const genres = (res.genres ?? []).filter((g) => g.id && g.name);
    cachedGenres = {
      expiresAt: Date.now() + CONFIG_TTL_MS,
      genres,
    };
    return genres;
  }

  async function browseMovies(params: {
    genre?: string;
    q?: string;
    sort?: 'rating' | 'popular' | 'year' | 'title';
    page?: number;
  }): Promise<TmdbBrowseResult> {
    const page = Math.max(1, params.page ?? 1);
    const [imageConfig, genres] = await Promise.all([getImageConfig(), getGenres()]);
    const genreMap = new Map(genres.map((g) => [g.id, g.name]));

    const searchQuery = params.q?.trim() ?? '';
    const genreParam = params.genre?.trim() ?? '';
    const sort = params.sort ?? 'popular';

    let listData: TmdbMovieListResponse;

    if (searchQuery) {
      listData = await tmdbFetch<TmdbMovieListResponse>('/search/movie', {
        query: searchQuery,
        include_adult: 'false',
        language: 'en-US',
        page,
      });
    } else if (genreParam && genreParam.toLowerCase() !== 'all') {
      const matchedGenre = genres.find(
        (g) => String(g.id) === genreParam || g.name.toLowerCase() === genreParam.toLowerCase(),
      );

      let discoverSort = 'popularity.desc';
      if (sort === 'rating') discoverSort = 'vote_average.desc';
      else if (sort === 'year') discoverSort = 'primary_release_date.desc';
      else if (sort === 'title') discoverSort = 'original_title.asc';

      listData = await tmdbFetch<TmdbMovieListResponse>('/discover/movie', {
        language: 'en-US',
        page,
        include_adult: 'false',
        sort_by: discoverSort,
        'vote_count.gte': sort === 'rating' ? 200 : undefined,
        with_genres: matchedGenre ? String(matchedGenre.id) : undefined,
      });
    } else if (sort === 'rating') {
      listData = await tmdbFetch<TmdbMovieListResponse>('/movie/top_rated', {
        language: 'en-US',
        page,
      });
    } else if (sort === 'year' || sort === 'title') {
      listData = await tmdbFetch<TmdbMovieListResponse>('/discover/movie', {
        language: 'en-US',
        page,
        include_adult: 'false',
        sort_by: sort === 'year' ? 'primary_release_date.desc' : 'original_title.asc',
        'vote_count.gte': 100,
      });
    } else {
      listData = await tmdbFetch<TmdbMovieListResponse>('/movie/popular', {
        language: 'en-US',
        page,
      });
    }

    const movies: TmdbMovieRecord[] = (listData.results ?? []).map((item) => {
      const itemGenres = (item.genre_ids ?? [])
        .map((id) => genreMap.get(id))
        .filter((name): name is string => Boolean(name));

      const posterUrl =
        buildTmdbImageUrl(imageConfig.imageBaseUrl, imageConfig.posterSize, item.poster_path) ?? '';
      const backdropUrl = buildTmdbImageUrl(
        imageConfig.imageBaseUrl,
        imageConfig.backdropSize,
        item.backdrop_path,
      );

      return {
        tmdbId: item.id,
        slug: String(item.id),
        title: item.title || 'Untitled Film',
        releaseYear: parseReleaseYear(item.release_date),
        genre: itemGenres[0] ?? 'Cinema',
        genres: itemGenres.length > 0 ? itemGenres : ['Cinema'],
        director: 'TMDB Archive',
        runtimeMinutes: 0,
        country: 'International',
        plotBrief: item.overview?.trim() || 'No plot overview has been provided for this title yet.',
        posterUrl,
        backdropUrl,
        tagline: null,
        tmdbRating:
          typeof item.vote_average === 'number' && item.vote_average > 0
            ? Number(item.vote_average.toFixed(1))
            : null,
        tmdbVoteCount: Number(item.vote_count ?? 0),
      };
    });

    // If user searched + chose a specific genre, apply genre filter cleanly client-side over search results
    const filteredMovies =
      searchQuery && genreParam && genreParam.toLowerCase() !== 'all'
        ? movies.filter((m) => m.genres.some((g) => g.toLowerCase() === genreParam.toLowerCase()))
        : movies;

    return {
      movies: filteredMovies,
      genres,
      page: listData.page ?? page,
      totalPages: Math.min(listData.total_pages ?? 1, 500),
    };
  }

  async function getMovieDetail(movieId: number): Promise<TmdbMovieRecord> {
    const [imageConfig, detail] = await Promise.all([
      getImageConfig(),
      tmdbFetch<TmdbRawMovieDetail>(`/movie/${movieId}`, {
        language: 'en-US',
        append_to_response: 'credits',
      }),
    ]);

    const genresList = (detail.genres ?? []).map((g) => g.name).filter(Boolean);
    const directors = (detail.credits?.crew ?? [])
      .filter((member) => member.job === 'Director')
      .map((member) => member.name);

    const cast: CastMember[] = (detail.credits?.cast ?? [])
      .slice(0, 8)
      .map((member) => ({
        id: member.id,
        name: member.name,
        character: member.character || '',
      }));

    const posterUrl =
      buildTmdbImageUrl(imageConfig.imageBaseUrl, imageConfig.posterSize, detail.poster_path) ?? '';
    const backdropUrl = buildTmdbImageUrl(
      imageConfig.imageBaseUrl,
      imageConfig.backdropSize,
      detail.backdrop_path,
    );

    const primaryCountry = detail.production_countries?.[0]?.name || 'International';

    return {
      tmdbId: detail.id,
      slug: String(detail.id),
      title: detail.title || 'Untitled Film',
      releaseYear: parseReleaseYear(detail.release_date),
      genre: genresList[0] ?? 'Cinema',
      genres: genresList.length > 0 ? genresList : ['Cinema'],
      director: directors.length > 0 ? directors.join(', ') : 'Unknown',
      runtimeMinutes: Number(detail.runtime ?? 0),
      country: primaryCountry,
      plotBrief: detail.overview?.trim() || 'No plot overview has been provided for this title yet.',
      posterUrl,
      backdropUrl,
      tagline: detail.tagline?.trim() ? detail.tagline.trim() : null,
      tmdbRating:
        typeof detail.vote_average === 'number' && detail.vote_average > 0
          ? Number(detail.vote_average.toFixed(1))
          : null,
      tmdbVoteCount: Number(detail.vote_count ?? 0),
      cast,
    };
  }

  return {
    getGenres,
    browseMovies,
    getMovieDetail,
  };
}
