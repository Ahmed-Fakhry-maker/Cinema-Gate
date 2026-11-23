import { AlertCircle, Bookmark, Check, ChevronLeft, ChevronRight, RefreshCw, Search, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FilmSummary } from '../types/cinema.ts';
import { FilmPoster } from './FilmPoster.tsx';
import { StarRatingDisplay } from './StarRating.tsx';

interface CatalogueViewProps {
  films: FilmSummary[];
  genres: string[];
  loading: boolean;
  error: string | null;
  errorCode?: string;
  selectedGenre: string;
  searchQuery: string;
  sortBy: 'popular' | 'rating' | 'year' | 'title';
  page: number;
  totalPages: number;
  onGenreChange: (genre: string) => void;
  onSearchChange: (q: string) => void;
  onSortChange: (sort: 'popular' | 'rating' | 'year' | 'title') => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onOpenFilm: (slug: string) => void;
  onToggleWatchlist: (film: FilmSummary) => Promise<void>;
}

export function CatalogueView({
  films = [],
  genres = [],
  loading,
  error,
  errorCode,
  selectedGenre = 'All',
  searchQuery = '',
  sortBy = 'popular',
  page = 1,
  totalPages = 1,
  onGenreChange,
  onSearchChange,
  onSortChange,
  onPageChange,
  onRetry,
  onOpenFilm,
  onToggleWatchlist,
}: CatalogueViewProps) {
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [heroBackdropFailed, setHeroBackdropFailed] = useState(false);

  const safeFilms = Array.isArray(films) ? films : [];
  const safeGenres = Array.isArray(genres) ? genres : [];

  const featuredFilm = useMemo(() => {
    if (page !== 1 || selectedGenre !== 'All' || searchQuery.trim() !== '' || safeFilms.length === 0) {
      return null;
    }
    return safeFilms.find((f) => Boolean(f.backdropUrl)) ?? safeFilms[0];
  }, [safeFilms, page, selectedGenre, searchQuery]);

  useEffect(() => {
    setHeroBackdropFailed(false);
  }, [featuredFilm?.backdropUrl]);

  const gridFilms = useMemo(() => {
    if (!featuredFilm) return safeFilms;
    return safeFilms.filter((f) => f.tmdbId !== featuredFilm.tmdbId);
  }, [safeFilms, featuredFilm]);

  const handleWatchlistClick = async (film: FilmSummary) => {
    setBusySlug(film.slug);
    try {
      await onToggleWatchlist(film);
    } finally {
      setBusySlug(null);
    }
  };

  return (
    <main className="pb-16">
      {/* Full-Bleed Backdrop Spotlight */}
      {featuredFilm && !loading && !error && (
        <section className="relative overflow-hidden border-b border-white/10 bg-[#0B0D11]">
          {featuredFilm.backdropUrl && !heroBackdropFailed ? (
            <img
              src={featuredFilm.backdropUrl}
              alt={`${featuredFilm.title} film backdrop`}
              referrerPolicy="no-referrer"
              onError={() => setHeroBackdropFailed(true)}
              className="absolute inset-0 w-full h-full object-cover object-center opacity-55"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#181D29] via-[#0E1118] to-[#0B0D11]" />
          )}

          {/* Measured directional scrims for >=4.5:1 text contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D11] via-[#0B0D11]/65 to-[#0B0D11]/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B0D11]/95 via-[#0B0D11]/70 to-transparent" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-8 py-12 sm:py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-8">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-[#D4D4D8] font-medium">
                <span className="text-[#E5A00D]">Featured</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{featuredFilm.releaseYear || 'TBA'}</span>
                <span aria-hidden="true">·</span>
                <span>{(featuredFilm.genres ?? [featuredFilm.genre]).slice(0, 2).join(' / ')}</span>
                {featuredFilm.tmdbRating !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#F4F4F5]">
                      <Star className="w-3.5 h-3.5 fill-[#E5A00D] text-[#E5A00D]" />
                      {featuredFilm.tmdbRating.toFixed(1)} TMDB
                    </span>
                  </>
                )}
              </div>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mt-3">
                {featuredFilm.title}
              </h1>

              <p className="mt-4 text-sm sm:text-base text-[#D4D4D8] leading-relaxed max-w-2xl line-clamp-3">
                {featuredFilm.plotBrief}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenFilm(featuredFilm.slug)}
                  className="px-5 py-2.5 text-sm font-semibold text-[#0B0D11] bg-[#E5A00D] rounded-lg hover:bg-[#F5B82E] transition-colors duration-150 whitespace-nowrap cursor-pointer"
                >
                  Explore Film
                </button>
                <button
                  type="button"
                  disabled={busySlug === featuredFilm.slug}
                  onClick={() => void handleWatchlistClick(featuredFilm)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-lg border inline-flex items-center gap-2 transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                    featuredFilm.inWatchlist
                      ? 'bg-[#E5A00D]/15 border-[#E5A00D]/50 text-[#F5B82E]'
                      : 'bg-[#131720]/85 border-white/20 text-white hover:border-white/50'
                  }`}
                >
                  {featuredFilm.inWatchlist ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>In Watchlist</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-4 h-4" />
                      <span>Add to Watchlist</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="hidden lg:block lg:col-span-4">
              <button
                type="button"
                onClick={() => onOpenFilm(featuredFilm.slug)}
                className="group block w-56 ml-auto cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E5A00D]"
              >
                <FilmPoster
                  posterUrl={featuredFilm.posterUrl}
                  title={featuredFilm.title}
                  releaseYear={featuredFilm.releaseYear}
                />
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-8 sm:pt-10">
        {/* Filter, Search, and Sort Toolbar */}
        <section className="pb-6 border-b border-white/10 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
                {searchQuery.trim()
                  ? `Results for “${searchQuery.trim()}”`
                  : selectedGenre !== 'All'
                    ? `${selectedGenre} Movies`
                    : sortBy === 'rating'
                      ? 'Top Rated Movies'
                      : 'Popular Movies'}
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search movies..."
                  aria-label="Search movies"
                  className="w-full sm:w-64 pl-10 pr-3.5 py-2 text-sm bg-[#131720] border border-white/15 rounded-lg text-white placeholder:text-[#71717A] focus:outline-none focus:border-[#E5A00D]"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-[#A1A1AA]">
                <span className="whitespace-nowrap">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) =>
                    onSortChange(e.target.value as 'popular' | 'rating' | 'year' | 'title')
                  }
                  className="px-3 py-2 text-sm bg-[#131720] border border-white/15 rounded-lg text-white focus:outline-none focus:border-[#E5A00D] cursor-pointer"
                >
                  <option value="popular">Most Popular</option>
                  <option value="rating">Top Rated</option>
                  <option value="year">Newest Releases</option>
                  <option value="title">Title A–Z</option>
                </select>
              </label>
            </div>
          </div>

          {safeGenres.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {['All', ...safeGenres].map((genre) => {
                const active = selectedGenre.toLowerCase() === genre.toLowerCase();
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => onGenreChange(genre)}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#E5A00D] text-[#0B0D11] font-semibold'
                        : 'bg-[#131720] text-[#A1A1AA] border border-white/10 hover:text-white hover:border-white/25'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Loading / Error / Empty / Poster Grid */}
        <section className="pt-8">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 sm:gap-7">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((idx) => (
                <div key={idx} className="animate-pulse">
                  <div className="aspect-[2/3] w-full rounded-xl bg-[#131720] border border-white/10" />
                  <div className="h-3 w-24 bg-[#181C26] mt-3 rounded" />
                  <div className="h-5 w-36 bg-[#181C26] mt-2 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-12 px-6 sm:px-10 bg-[#131720] border border-white/10 rounded-xl max-w-2xl mx-auto text-center">
              <AlertCircle className="w-9 h-9 text-[#E5A00D] mx-auto mb-3" strokeWidth={1.75} />
              <h3 className="font-display text-2xl font-semibold text-white">
                {errorCode === 'TMDB_KEY_MISSING'
                  ? 'TMDB API Key Required'
                  : 'Unable to Load Movies'}
              </h3>
              <p className="text-sm sm:text-base text-[#A1A1AA] mt-2 leading-relaxed">{error}</p>
              {errorCode === 'TMDB_KEY_MISSING' && (
                <p className="text-xs font-mono text-[#71717A] mt-3">
                  Config location: .env (TMDB_API_KEY) or src/server/tmdb.ts
                </p>
              )}
              <button
                type="button"
                onClick={onRetry}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#0B0D11] bg-[#E5A00D] rounded-lg hover:bg-[#F5B82E] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
            </div>
          ) : gridFilms.length === 0 && !featuredFilm ? (
            <div className="py-16 px-6 text-center bg-[#131720] border border-white/10 rounded-xl">
              <h3 className="font-display text-2xl font-semibold text-white">No matching movies</h3>
              <p className="text-sm text-[#A1A1AA] mt-2">
                Try another search term or reset your genre filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  onGenreChange('All');
                  onSearchChange('');
                }}
                className="mt-5 px-4 py-2 text-sm font-semibold text-[#0B0D11] bg-[#E5A00D] rounded-lg hover:bg-[#F5B82E] transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-5 sm:gap-x-7 gap-y-10">
                {gridFilms.map((film) => (
                  <article key={film.tmdbId} className="group flex flex-col">
                    <button
                      type="button"
                      onClick={() => onOpenFilm(film.slug)}
                      className="block w-full text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E5A00D] rounded-xl"
                    >
                      <FilmPoster
                        posterUrl={film.posterUrl}
                        title={film.title}
                        releaseYear={film.releaseYear}
                      />
                    </button>

                    <div className="mt-3.5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-[#A1A1AA]">
                          <span className="font-mono tabular-nums">
                            {film.releaseYear > 0 ? film.releaseYear : 'TBA'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{film.genre}</span>
                        </div>

                        <h3 className="font-display text-lg font-semibold text-[#F4F4F5] mt-1 leading-snug line-clamp-2">
                          <button
                            type="button"
                            onClick={() => onOpenFilm(film.slug)}
                            className="text-left hover:text-[#E5A00D] transition-colors cursor-pointer"
                          >
                            {film.title}
                          </button>
                        </h3>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
                        {film.reviewCount > 0 ? (
                          <StarRatingDisplay rating={film.averageRating} reviewCount={film.reviewCount} />
                        ) : film.tmdbRating !== null ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[#D4D4D8] tabular-nums">
                            <Star className="w-3.5 h-3.5 fill-[#E5A00D] text-[#E5A00D]" />
                            {film.tmdbRating.toFixed(1)}
                            <span className="text-[#71717A] font-sans">TMDB</span>
                          </span>
                        ) : (
                          <span className="text-xs text-[#71717A]">Unrated</span>
                        )}

                        <button
                          type="button"
                          disabled={busySlug === film.slug}
                          onClick={() => void handleWatchlistClick(film)}
                          aria-label={
                            film.inWatchlist
                              ? `Remove ${film.title} from watchlist`
                              : `Add ${film.title} to watchlist`
                          }
                          className={`min-h-[34px] px-2 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            film.inWatchlist
                              ? 'text-[#F5B82E] bg-[#E5A00D]/15 hover:bg-[#E5A00D]/25'
                              : 'text-[#A1A1AA] hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {film.inWatchlist ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Saved</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-12 pt-8 border-t border-white/10 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#131720] border border-white/15 rounded-lg hover:border-white/35 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <span className="font-mono text-xs sm:text-sm text-[#A1A1AA] tabular-nums">
                    Page {page} of {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#131720] border border-white/15 rounded-lg hover:border-white/35 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
