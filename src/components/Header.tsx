import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useAuth } from '../context/AuthContext.tsx';

export type ActiveRoute = 'catalogue' | 'top-rated' | 'watchlist' | 'film';

interface HeaderProps {
  activeRoute: ActiveRoute;
  onNavigate: (path: string, sortMode?: 'popular' | 'rating' | 'year' | 'title') => void;
}

export function Header({ activeRoute, onNavigate }: HeaderProps) {
  const { user, openAuthModal, logout } = useAuth();
  const firstName = user ? user.name.split(' ')[0] : '';
  const logoRef = useRef<HTMLAnchorElement>(null);

  // Loop: C and G slide together (rest of the name hidden), then part to reveal it. Deliberately ignores prefers-reduced-motion (requested).
  useEffect(() => {
    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(logoRef);
      const [c, g, rest] = [q('.logo-c'), q('.logo-g'), q('.logo-rest')];
      // Half the gap between C and G: each letter moves this far to touch the other.
      const half = () => {
        const [ce, ge] = [c[0] as HTMLElement, g[0] as HTMLElement];
        return (ge.offsetLeft - ce.offsetLeft - ce.offsetWidth) / 2;
      };
      const tl = gsap.timeline({ repeat: -1 });
      tl.fromTo(c, { x: half }, { x: 0, duration: 1.2, ease: 'power3.inOut' }, 0.4)
        .fromTo(g, { x: () => -half() }, { x: 0, duration: 1.2, ease: 'power3.inOut' }, 0.4)
        .fromTo(rest, { opacity: 0 }, { opacity: 1, duration: 0.7 }, 0.8)
        .to(c, { x: half, duration: 1.2, ease: 'power3.inOut' }, '+=3')
        .to(g, { x: () => -half(), duration: 1.2, ease: 'power3.inOut' }, '<')
        .to(rest, { opacity: 0, duration: 0.6 }, '<');
      // Fonts load late and change the gap; re-measure on any size change.
      const ro = new ResizeObserver(() => tl.invalidate());
      ro.observe(logoRef.current!);
      return () => ro.disconnect();
    }, logoRef);
    return () => ctx.revert();
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-[#0B0D11]/88 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          ref={logoRef}
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/', 'popular');
          }}
          aria-label="Cinema Gate"
          className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white whitespace-pre shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E5A00D]"
        >
          <span aria-hidden="true">
            <span className="logo-c inline-block text-[#E5A00D]">C</span>
            <span className="logo-rest inline-block">inema </span>
            <span className="logo-g inline-block text-[#E5A00D]">G</span>
            <span className="logo-rest inline-block">ate</span>
          </span>
        </a>

        {/* Zone 2: Concise single-line text navigation links */}
        <nav className="flex items-center gap-5 sm:gap-8 text-sm font-medium text-[#A1A1AA]" aria-label="Primary navigation">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/', 'popular');
            }}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors duration-150 ${
              activeRoute === 'catalogue' || activeRoute === 'film'
                ? 'text-white border-[#E5A00D]'
                : 'border-transparent hover:text-white hover:border-white/30'
            }`}
          >
            Browse
          </a>
          <a
            href="/?sort=rating"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/', 'rating');
            }}
            className={`hidden sm:inline-block whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors duration-150 ${
              activeRoute === 'top-rated'
                ? 'text-white border-[#E5A00D]'
                : 'border-transparent hover:text-white hover:border-white/30'
            }`}
          >
            Top Rated
          </a>
          <a
            href="/watchlist"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/watchlist');
            }}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors duration-150 ${
              activeRoute === 'watchlist'
                ? 'text-white border-[#E5A00D]'
                : 'border-transparent hover:text-white hover:border-white/30'
            }`}
          >
            Watchlist
          </a>
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-[#F4F4F5] bg-[#181C26] border border-white/15 rounded-lg hover:bg-[#222736] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A00D]"
              title={`Signed in as ${user.email}`}
            >
              Sign out · {firstName}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-[#0B0D11] bg-[#E5A00D] rounded-lg hover:bg-[#F5B82E] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A00D]"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
