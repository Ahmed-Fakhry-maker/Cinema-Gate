import { ArrowRight, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../lib/api.ts';
import type { WatchlistEntry } from '../types/cinema.ts';
import { FilmPoster } from './FilmPoster.tsx';
import { StarRatingDisplay } from './StarRating.tsx';

interface WatchlistViewProps {
  onOpenFilm: (slug: string) => void;
  onBrowseCatalogue: () => void;
  onWatchlistChanged: () => void;
}

export function WatchlistView({ onOpenFilm, onBrowseCatalogue, onWatchlistChanged }: WatchlistViewProps) {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingSlug, setRemovingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    api
      .getWatchlist()
      .then((res) => {
        if (active) setItems(res.watchlist);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load watchlist.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const handleRemove = async (slug: string) => {
    setRemovingSlug(slug);
    try {
      await api.removeFromWatchlist(slug);
      setItems((prev) => prev.filter((item) => item.slug !== slug));
      onWatchlistChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove film.');
    } finally {
      setRemovingSlug(null);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
      <section className="pb-8 border-b border-white/10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-[#A1A1AA] font-medium">Personal Queue</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-white mt-2">
            Your Watchlist
          </h1>
        </div>
        {user && (
          <p className="font-mono text-sm text-[#A1A1AA] tabular-nums">
            {items.length} {items.length === 1 ? 'film saved' : 'films saved'}
          </p>
        )}
      </section>

      {authLoading || loading ? (
        <div className="py-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 sm:gap-7">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="animate-pulse">
              <div className="aspect-[2/3] rounded-xl bg-[#131720] border border-white/10" />
              <div className="h-5 w-36 bg-[#181C26] mt-4 rounded" />
            </div>
          ))}
        </div>
      ) : !user ? (
        <section className="mt-10 bg-[#131720] border border-white/10 rounded-xl p-8 sm:p-12 max-w-2xl">
          <h2 className="font-display text-2xl font-semibold text-white">
            Sign in to view your watchlist
          </h2>
          <p className="text-sm sm:text-base text-[#A1A1AA] mt-2 leading-relaxed">
            Your saved movies, star ratings, and written reviews are tied to your personal Cinema Gate account across sessions.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="px-5 py-2.5 text-sm font-semibold text-[#0B0D11] bg-[#E5A00D] rounded-lg hover:bg-[#F5B82E] transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => openAuthModal('signup')}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#181C26] border border-white/15 rounded-lg hover:bg-[#222736] transition-colors cursor-pointer"
            >
              Create Account
            </button>
          </div>
        </section>
      ) : error ? (
        <section className="mt-10 p-6 bg-[#131720] border border-[#EF4444]/35 rounded-xl text-[#FCA5A5]">
          {error}
        </section>
      ) : items.length === 0 ? (
        <section className="mt-10 bg-[#131720] border border-white/10 rounded-xl p-8 sm:p-12 max-w-2xl">
          <h2 className="font-display text-2xl font-semibold text-white">
            Your watchlist is empty
          </h2>
          <p className="text-sm sm:text-base text-[#A1A1AA] mt-2 leading-relaxed">
            Browse movies on Cinema Gate and click "Save" on any title you want to watch later.
          </p>
          <button
            type="button"
            onClick={onBrowseCatalogue}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#0B0D11] bg-[#E5A00D] rounded-lg hover:bg-[#F5B82E] transition-colors cursor-pointer"
          >
            <span>Browse Movies</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      ) : (
        <section className="pt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-5 sm:gap-x-7 gap-y-10">
          {items.map((film) => (
            <article key={film.id} className="group flex flex-col">
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

                  <h2 className="font-display text-lg font-semibold text-[#F4F4F5] mt-1 leading-snug line-clamp-2">
                    <button
                      type="button"
                      onClick={() => onOpenFilm(film.slug)}
                      className="text-left hover:text-[#E5A00D] transition-colors cursor-pointer"
                    >
                      {film.title}
                    </button>
                  </h2>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
                  {film.reviewCount > 0 ? (
                    <StarRatingDisplay rating={film.averageRating} reviewCount={film.reviewCount} />
                  ) : film.tmdbRating !== null ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[#D4D4D8] tabular-nums">
                      <Star className="w-3.5 h-3.5 fill-[#E5A00D] text-[#E5A00D]" />
                      {film.tmdbRating.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-xs text-[#71717A]">Saved</span>
                  )}

                  <button
                    type="button"
                    disabled={removingSlug === film.slug}
                    onClick={() => void handleRemove(film.slug)}
                    className="min-h-[34px] px-2 py-1 text-xs font-medium text-[#FCA5A5] hover:bg-[#7F1D1D]/30 rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{removingSlug === film.slug ? 'Removing...' : 'Remove'}</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
