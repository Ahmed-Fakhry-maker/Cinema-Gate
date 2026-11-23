import { Star } from 'lucide-react';
import { useState } from 'react';

interface StarRatingDisplayProps {
  rating: number | null;
  reviewCount?: number;
  size?: 'sm' | 'md';
}

export function StarRatingDisplay({ rating, reviewCount, size = 'sm' }: StarRatingDisplayProps) {
  const iconClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const filledCount = rating !== null ? Math.round(rating) : 0;

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className="inline-flex items-center gap-0.5"
        aria-label={rating !== null ? `${rating} out of 5 stars` : 'Not yet reviewed'}
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <Star
            key={value}
            className={`${iconClass} ${
              value <= filledCount ? 'fill-[#E5A00D] text-[#E5A00D]' : 'fill-transparent text-[#3F3F46]'
            }`}
            strokeWidth={1.75}
          />
        ))}
      </div>
      <span className="font-mono text-xs text-[#F4F4F5] tabular-nums font-medium">
        {rating !== null ? rating.toFixed(1) : '—'}
      </span>
      {typeof reviewCount === 'number' && (
        <span className="text-xs text-[#A1A1AA] tabular-nums">
          ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
        </span>
      )}
    </div>
  );
}

interface StarRatingInputProps {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}

export function StarRatingInput({ value, onChange, disabled = false }: StarRatingInputProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const activeValue = hovered ?? value;

  return (
    <div
      className="inline-flex items-center gap-1"
      role="radiogroup"
      aria-label="Select film rating from 1 to 5 stars"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= activeValue;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onChange(star)}
            role="radio"
            aria-checked={value === star}
            aria-label={`Rate ${star} ${star === 1 ? 'star' : 'stars'}`}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A00D] disabled:opacity-50 cursor-pointer"
          >
            <Star
              className={`w-6 h-6 transition-colors duration-150 ${
                active ? 'fill-[#E5A00D] text-[#E5A00D]' : 'fill-transparent text-[#52525B] hover:text-[#E5A00D]'
              }`}
              strokeWidth={1.75}
            />
          </button>
        );
      })}
      <span className="ml-2 font-mono text-sm text-[#A1A1AA] tabular-nums">
        {value > 0 ? `${value} / 5` : 'Select rating'}
      </span>
    </div>
  );
}
