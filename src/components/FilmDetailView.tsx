import { AlertCircle, ArrowLeft, Bookmark, Check, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../lib/api.ts';
import type { FilmDetail } from '../types/cinema.ts';
import { FilmPoster } from './FilmPoster.tsx';
import { StarRatingDisplay, StarRatingInput } from './StarRating.tsx';

interface FilmDetailViewProps {
  slug: string;
  onBack: () => void;
  onFilmChanged: () => void;
}

function formatDate(dateString: string): string {
  const isoCandidate = dateString.includes('T') ? dateString : dateString.replace(' ', 'T') + 'Z';
  const parsed = new Date(isoCandidate);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function FilmDetailView({ slug, onBack, onFilmChanged }: FilmDetailViewProps) {
  const { user, openAuthModal } = useAuth();
  const [film, setFilm] = useState<FilmDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backdropFailed, setBackdropFailed] = useState(false);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [deletingReview, setDeletingReview] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [watchlistBusy, setWatchlistBusy] = useState(false);

  const loadFilm = async () => {
    setLoading(true);
    setError(null);
    setBackdropFailed(false);
    try {
      const res = await api.getFilmDetail(slug);
      setFilm(res.film);
      if (res.film.userReview) {
        setRating(res.film.userReview.rating);
        setComment(res.film.userReview.comment);
      } else {
        setRating(0);
        setComment('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load film details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFilm();
  }, [slug, user?.id]);

  const distribution = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    if (!film) return counts;
    for (const r of film.reviews) {
      counts[r.rating] = (counts[r.rating] ?? 0) + 1;
    }
    return counts;
  }, [film]);

  const handleToggleWatchlist = async () => {
    if (!film) return;
    if (!user) {
      openAuthModal('login', () => void handleToggleWatchlist());
      return;
    }
    setWatchlistBusy(true);
    try {
      if (film.inWatchlist) {
        await api.removeFromWatchlist(film.slug);
        setFilm({ ...film, inWatchlist: false });
      } else {
        await api.addToWatchlist(film.slug);
        setFilm({ ...film, inWatchlist: true });
      }
      onFilmChanged();
    } catch (err) {
      setReviewFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update watchlist.',
      });
    } finally {
      setWatchlistBusy(false);
    }
  };

  const handleSubmitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!film) return;
    if (!user) {
      openAuthModal('login');
      return;
    }
    if (rating < 1 || rating > 5) {
      setReviewFeedback({ type: 'error', text: 'Please select a star rating between 1 and 5.' });
      return;
    }
    if (comment.trim().length < 3) {
      setReviewFeedback({ type: 'error', text: 'Please write a short review (at least 3 characters).' });
      return;
    }

    setSavingReview(true);
    setReviewFeedback(null);
    try {
      await api.saveReview(film.slug, { rating, comment: comment.trim() });
      await loadFilm();
      onFilmChanged();
      setReviewFeedback({ type: 'success', text: 'Your rating and review have been saved.' });
    } catch (err) {
      setReviewFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save review.',
      });
    } finally {
      setSavingReview(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!film || !film.userReview) return;
    setDeletingReview(true);
    setReviewFeedback(null);
    try {
      await api.deleteReview(film.slug);
      setRating(0);
      setComment('');
      await loadFilm();
      onFilmChanged();
      setReviewFeedback({ type: 'success', text: 'Your review has been removed.' });
    } catch (err) {
      setReviewFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete review.',
      });
    } finally {
      setDeletingReview(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
        <div className="animate-pulse space-y-8">
          <div className="h-64 sm:h-80 w-full rounded-xl bg-[#131720] border border-white/10" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-3 aspect-[2/3] rounded-xl bg-[#131720] border border-white/10" />
            <div className="lg:col-span-9 space-y-4">
              <div className="h-10 w-2/3 bg-[#181C26] rounded" />
              <div className="h-4 w-1/2 bg-[#181C26] rounded" />
              <div className="h-28 w-full bg-[#181C26] rounded" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !film) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#A1A1AA] hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Browse</span>
        </button>
        <div className="mt-8 p-8 sm:p-10 bg-[#131720] border border-white/10 rounded-xl max-w-xl">
          <AlertCircle className="w-8 h-8 text-[#E5A00D] mb-3" />
          <h1 className="font-display text-2xl font-semibold text-white">Movie Unavailable</h1>
          <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">
            {error ?? 'The requested movie could not be loaded.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-16">
      {/* Full-Width Backdrop Stage */}
      <div className="relative h-64 sm:h-80 lg:h-[420px] w-full overflow-hidden bg-[#131720] border-b border-white/10">
        {film.backdropUrl && !backdropFailed ? (
          <img
            src={film.backdropUrl}
            alt={`${film.title} backdrop`}
            referrerPolicy="no-referrer"
            onError={() => setBackdropFailed(true)}
            className="w-full h-full object-cover object-center opacity-60"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1B2130] via-[#121620] to-[#0B0D11]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D11] via-[#0B0D11]/55 to-black/25" />

        <div className="absolute top-6 left-0 right-0 max-w-7xl mx-auto px-4 sm:px-8">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0B0D11]/75 backdrop-blur-sm border border-white/15 text-sm font-medium text-white hover:border-white/40 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Browse</span>
          </button>
        </div>
      </div>

      {/* Poster & Details Overlap */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-24 sm:-mt-32 relative z-10">
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-3 max-w-[260px] mx-auto lg:max-w-none w-full">
            <FilmPoster posterUrl={film.posterUrl} title={film.title} releaseYear={film.releaseYear} />

            <button
              type="button"
              disabled={watchlistBusy}
              onClick={() => void handleToggleWatchlist()}
              className={`mt-4 w-full min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-lg border inline-flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer ${
                film.inWatchlist
                  ? 'bg-[#E5A00D]/15 border-[#E5A00D]/50 text-[#F5B82E] hover:bg-[#E5A00D]/25'
                  : 'bg-[#E5A00D] border-[#E5A00D] text-[#0B0D11] hover:bg-[#F5B82E]'
              }`}
            >
              {film.inWatchlist ? (
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

          <div className="lg:col-span-9 lg:pt-16">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest text-[#A1A1AA] font-medium">
              <span>{(film.genres ?? [film.genre]).join(' / ')}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{film.releaseYear || 'TBA'}</span>
              {film.runtimeMinutes > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{film.runtimeMinutes} min</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{film.country}</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl font-bold text-white mt-3 leading-tight">
              {film.title}
            </h1>

            {film.tagline && (
              <p className="mt-2 text-base sm:text-lg italic text-[#A1A1AA]">"{film.tagline}"</p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-6">
              {film.tmdbRating !== null && (
                <div className="inline-flex items-center gap-2">
                  <Star className="w-4 h-4 fill-[#E5A00D] text-[#E5A00D]" />
                  <span className="font-mono text-sm font-semibold text-white tabular-nums">
                    {film.tmdbRating.toFixed(1)}
                  </span>
                  <span className="text-xs text-[#A1A1AA] tabular-nums">
                    TMDB ({film.tmdbVoteCount.toLocaleString()} votes)
                  </span>
                </div>
              )}

              <StarRatingDisplay rating={film.averageRating} reviewCount={film.reviewCount} size="md" />
            </div>

            {/* Metadata Grid */}
            <dl className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-white/10">
              <div>
                <dt className="text-xs uppercase tracking-wider text-[#71717A]">Director</dt>
                <dd className="text-sm font-medium text-white mt-1">{film.director}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[#71717A]">Release Year</dt>
                <dd className="font-mono text-sm font-medium text-white mt-1 tabular-nums">
                  {film.releaseYear || 'TBA'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[#71717A]">Genre</dt>
                <dd className="text-sm font-medium text-white mt-1">{(film.genres ?? [film.genre]).slice(0, 2).join(', ')}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-[#71717A]">Runtime</dt>
                <dd className="font-mono text-sm font-medium text-white mt-1 tabular-nums">
                  {film.runtimeMinutes > 0 ? `${film.runtimeMinutes} min` : '—'}
                </dd>
              </div>
            </dl>

            {/* Plot Brief */}
            <div className="mt-7">
              <h2 className="text-xs uppercase tracking-widest text-[#A1A1AA] font-medium">Overview</h2>
              <p className="mt-3 text-base sm:text-[17px] text-[#E4E4E7] leading-relaxed max-w-prose">
                {film.plotBrief}
              </p>
            </div>

            {/* Top Cast */}
            {film.cast && film.cast.length > 0 && (
              <div className="mt-8">
                <h2 className="text-xs uppercase tracking-widest text-[#A1A1AA] font-medium">Featured Cast</h2>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {film.cast.map((member) => (
                    <div key={member.id} className="py-2 border-b border-white/10">
                      <p className="text-sm font-medium text-white truncate">{member.name}</p>
                      {member.character && (
                        <p className="text-xs text-[#A1A1AA] truncate mt-0.5">{member.character}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Ratings & Reviews Section */}
        <section className="mt-14 pt-12 border-t border-white/10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
          {/* Average Rating & Breakdown */}
          <div className="lg:col-span-4 space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-[#A1A1AA] font-medium">
                Cinema Gate Member Rating
              </p>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="font-mono text-5xl font-semibold text-white tabular-nums">
                  {film.averageRating !== null ? film.averageRating.toFixed(1) : '—'}
                </span>
                <span className="text-sm text-[#71717A] font-mono tabular-nums">/ 5.0</span>
              </div>
              <p className="text-sm text-[#A1A1AA] mt-1 tabular-nums">
                Based on {film.reviewCount} {film.reviewCount === 1 ? 'member review' : 'member reviews'}
              </p>
            </div>

            <div className="space-y-2.5 pt-4 border-t border-white/10">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = distribution[star] ?? 0;
                const pct = film.reviewCount > 0 ? Math.round((count / film.reviewCount) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-3 text-xs">
                    <span className="w-8 font-mono text-[#A1A1AA] tabular-nums">{star} ★</span>
                    <div className="flex-1 h-2 bg-[#181C26] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#E5A00D] transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-[#A1A1AA] tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Review Composer & Individual Reviews */}
          <div className="lg:col-span-8 space-y-10">
            <div className="bg-[#131720] border border-white/10 rounded-xl p-6 sm:p-7">
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-white">
                    {film.userReview ? 'Update Your Review' : 'Write a Review'}
                  </h2>
                  <p className="text-xs text-[#A1A1AA] mt-1">
                    {user
                      ? `Posting as ${user.name}`
                      : 'Sign in with a Cinema Gate account to rate and review this film.'}
                  </p>
                </div>

                {film.userReview && user && (
                  <button
                    type="button"
                    disabled={deletingReview}
                    onClick={() => void handleDeleteReview()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#FCA5A5] hover:bg-[#7F1D1D]/30 rounded-md transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletingReview ? 'Removing...' : 'Delete'}</span>
                  </button>
                )}
              </div>

              {user ? (
                <form onSubmit={handleSubmitReview} className="mt-5 space-y-5">
                  <div>
                    <span className="block text-sm font-medium text-[#E4E4E7] mb-1.5">Your Rating</span>
                    <StarRatingInput value={rating} onChange={setRating} disabled={savingReview} />
                  </div>

                  <div>
                    <label htmlFor="review-comment" className="block text-sm font-medium text-[#E4E4E7] mb-1.5">
                      Written Review
                    </label>
                    <textarea
                      id="review-comment"
                      rows={4}
                      required
                      minLength={3}
                      maxLength={2000}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Share your thoughts on direction, pacing, performances, or cinematography..."
                      className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D11] border border-white/15 rounded-lg text-white placeholder:text-[#71717A] focus:outline-none focus:border-[#E5A00D] leading-relaxed"
                    />
                  </div>

                  {reviewFeedback && (
                    <p
                      role="status"
                      className={`text-sm px-3.5 py-2.5 rounded-lg border ${
                        reviewFeedback.type === 'success'
                          ? 'text-[#86EFAC] bg-[#14532D]/30 border-[#22C55E]/35'
                          : 'text-[#FCA5A5] bg-[#7F1D1D]/30 border-[#EF4444]/35'
                      }`}
                    >
                      {reviewFeedback.text}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={savingReview}
                    className="px-5 py-2.5 text-sm font-semibold text-[#0B0D11] bg-[#E5A00D] rounded-lg hover:bg-[#F5B82E] disabled:opacity-60 transition-colors duration-150 cursor-pointer"
                  >
                    {savingReview
                      ? 'Saving...'
                      : film.userReview
                        ? 'Save Changes'
                        : 'Publish Review'}
                  </button>
                </form>
              ) : (
                <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-sm text-[#A1A1AA] leading-relaxed">
                    Join Cinema Gate to publish your star rating, write reviews, and build a personal watchlist.
                  </p>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => openAuthModal('login')}
                      className="px-4 py-2 text-sm font-semibold text-[#0B0D11] bg-[#E5A00D] rounded-lg hover:bg-[#F5B82E] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => openAuthModal('signup')}
                      className="px-4 py-2 text-sm font-medium text-white bg-[#181C26] border border-white/15 rounded-lg hover:bg-[#222736] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Create Account
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Individual Reviews List */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-white pb-4 border-b border-white/10">
                Member Reviews
              </h2>

              {film.reviews.length === 0 ? (
                <p className="py-8 text-sm text-[#A1A1AA]">
                  No member reviews yet. Be the first to share your take on Cinema Gate.
                </p>
              ) : (
                <div className="divide-y divide-white/10">
                  {film.reviews.map((review) => (
                    <article key={review.id} className="py-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold text-white">{review.author.name}</span>
                          {review.isOwner && (
                            <>
                              <span aria-hidden="true" className="text-[#71717A]">·</span>
                              <span className="text-xs font-medium text-[#E5A00D]">Your review</span>
                            </>
                          )}
                        </div>
                        <span className="font-mono text-xs text-[#71717A] tabular-nums">
                          {formatDate(review.updatedAt)}
                        </span>
                      </div>

                      <div className="mt-2">
                        <StarRatingDisplay rating={review.rating} />
                      </div>

                      <p className="mt-3 text-base text-[#E4E4E7] leading-relaxed max-w-prose whitespace-pre-line">
                        {review.comment}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
