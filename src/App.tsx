import { useCallback, useEffect, useState } from 'react';
import { AuthModal } from './components/AuthModal.tsx';
import { CatalogueView } from './components/CatalogueView.tsx';
import { FilmDetailView } from './components/FilmDetailView.tsx';
import { Header, type ActiveRoute } from './components/Header.tsx';
import { WatchlistView } from './components/WatchlistView.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ApiError, api } from './lib/api.ts';
import type { FilmSummary } from './types/cinema.ts';

function parseRoute(pathname: string): { view: 'catalogue' | 'watchlist' | 'film'; slug?: string } {
  if (pathname === '/watchlist') {
    return { view: 'watchlist' };
  }
  const filmMatch = pathname.match(/^\/films\/([^/]+)$/);
  if (filmMatch && filmMatch[1]) {
    return { view: 'film', slug: decodeURIComponent(filmMatch[1]) };
  }
  return { view: 'catalogue' };
}

function CinemaAppShell() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const [pathname, setPathname] = useState(() => window.location.pathname);

  const [films, setFilms] = useState<FilmSummary[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);

  const [selectedGenre, setSelectedGenre] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'year' | 'title'>('popular');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [topRatedHighlight, setTopRatedHighlight] = useState(false);

  const fetchCatalogue = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const res = await api.getFilms({
        genre: selectedGenre,
        q: searchQuery,
        sort: sortBy,
        page,
      });
      setFilms(Array.isArray(res.films) ? res.films : []);
      setGenres(Array.isArray(res.genres) ? res.genres : []);
      setTotalPages(typeof res.totalPages === 'number' ? res.totalPages : 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorCode(err.code);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to load movies.');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedGenre, searchQuery, sortBy, page]);

  useEffect(() => {
    if (authLoading) return;
    void fetchCatalogue();
  }, [fetchCatalogue, authLoading, user?.id]);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback(
    (nextPath: string, forcedSort?: 'popular' | 'rating' | 'year' | 'title') => {
      if (forcedSort) {
        setSortBy(forcedSort);
        setPage(1);
        setTopRatedHighlight(forcedSort === 'rating');
      } else if (nextPath === '/') {
        setTopRatedHighlight(false);
      }
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, '', nextPath);
        setPathname(nextPath);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [],
  );

  const handleToggleWatchlist = useCallback(
    async (film: FilmSummary) => {
      if (!user) {
        openAuthModal('login', () => {
          void api.addToWatchlist(film.slug).then(() => fetchCatalogue());
        });
        return;
      }

      try {
        if (film.inWatchlist) {
          await api.removeFromWatchlist(film.slug);
        } else {
          await api.addToWatchlist(film.slug);
        }
        setFilms((prev) =>
          prev.map((item) =>
            item.slug === film.slug ? { ...item, inWatchlist: !film.inWatchlist } : item,
          ),
        );
      } catch (err) {
        console.error('Failed to update watchlist:', err);
      }
    },
    [user, openAuthModal, fetchCatalogue],
  );

  const route = parseRoute(pathname);
  let activeNav: ActiveRoute = 'catalogue';
  if (route.view === 'watchlist') activeNav = 'watchlist';
  else if (route.view === 'film') activeNav = 'film';
  else if (topRatedHighlight) activeNav = 'top-rated';

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D11] text-[#F4F4F5]">
      <Header activeRoute={activeNav} onNavigate={navigate} />

      <div className="flex-1">
        {route.view === 'watchlist' ? (
          <WatchlistView
            onOpenFilm={(slug) => navigate(`/films/${encodeURIComponent(slug)}`)}
            onBrowseCatalogue={() => navigate('/', 'popular')}
            onWatchlistChanged={() => void fetchCatalogue()}
          />
        ) : route.view === 'film' && route.slug ? (
          <FilmDetailView
            slug={route.slug}
            onBack={() => navigate('/')}
            onFilmChanged={() => void fetchCatalogue()}
          />
        ) : (
          <CatalogueView
            films={films}
            genres={genres}
            loading={loading}
            error={error}
            errorCode={errorCode}
            selectedGenre={selectedGenre}
            searchQuery={searchQuery}
            sortBy={sortBy}
            page={page}
            totalPages={totalPages}
            onGenreChange={(nextGenre) => {
              setSelectedGenre(nextGenre);
              setPage(1);
            }}
            onSearchChange={(q) => {
              setSearchQuery(q);
              setPage(1);
            }}
            onSortChange={(nextSort) => {
              setSortBy(nextSort);
              setPage(1);
              setTopRatedHighlight(nextSort === 'rating');
            }}
            onPageChange={(nextPage) => {
              setPage(nextPage);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onRetry={() => void fetchCatalogue()}
            onOpenFilm={(slug) => navigate(`/films/${encodeURIComponent(slug)}`)}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}
      </div>

      <footer className="border-t border-white/10 bg-[#0E1117]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#A1A1AA]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-base font-bold text-white">Cinema Gate</span>
            <span aria-hidden="true">·</span>
            <span>Film data and imagery provided by TMDB</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigate('/', 'popular');
              }}
              className="hover:text-white transition-colors"
            >
              Browse
            </a>
            <a
              href="/watchlist"
              onClick={(e) => {
                e.preventDefault();
                navigate('/watchlist');
              }}
              className="hover:text-white transition-colors"
            >
              Watchlist
            </a>
          </div>
        </div>
      </footer>

      <AuthModal />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CinemaAppShell />
    </AuthProvider>
  );
}
