import { Film } from 'lucide-react';
import { useEffect, useState } from 'react';

interface FilmPosterProps {
  posterUrl: string;
  title: string;
  releaseYear: number;
  className?: string;
}

export function FilmPoster({ posterUrl, title, releaseYear, className = '' }: FilmPosterProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [posterUrl]);

  if (failed || !posterUrl) {
    return (
      <div
        className={`aspect-[2/3] w-full rounded-xl bg-gradient-to-b from-[#1A1F2B] to-[#11141C] border border-white/10 group-hover:border-[#E5A00D] transition-colors duration-200 flex flex-col items-center justify-center p-6 text-center select-none ${className}`}
        role="img"
        aria-label={`${title} (${releaseYear || 'TBA'}) poster unavailable`}
      >
        <Film className="w-8 h-8 text-[#71717A] mb-3" strokeWidth={1.5} />
        <span className="font-display text-base font-semibold text-[#F4F4F5] leading-snug line-clamp-3">
          {title}
        </span>
        {releaseYear > 0 && (
          <span className="font-mono text-xs text-[#A1A1AA] mt-1.5 tabular-nums">{releaseYear}</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`aspect-[2/3] w-full overflow-hidden rounded-xl bg-[#131720] border border-white/10 group-hover:border-[#E5A00D] transition-colors duration-200 shadow-lg shadow-black/40 ${className}`}
    >
      <img
        src={posterUrl}
        alt={`${title}${releaseYear > 0 ? ` (${releaseYear})` : ''} movie poster`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
      />
    </div>
  );
}
