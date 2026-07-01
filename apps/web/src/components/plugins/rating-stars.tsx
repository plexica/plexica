// rating-stars.tsx
// Shared RatingStars component for marketplace display.
// WCAG 2.1 AA: color is not the only means of conveying information (1.4.1).
// Uses role="img" with descriptive aria-label so screen readers get the numeric rating.

import { Star } from 'lucide-react';

interface RatingStarsProps {
  rating?: number;
  size?: 'sm' | 'md';
}

function StarIcon({ filled, sizeClass }: { filled: boolean; sizeClass: string }): JSX.Element {
  return (
    <Star
      className={`${sizeClass} ${filled ? 'text-amber-400' : 'text-neutral-200'}`}
      aria-hidden="true"
      fill="currentColor"
    />
  );
}

export function RatingStars({ rating, size = 'sm' }: RatingStarsProps): JSX.Element | null {
  if (rating === undefined || rating === null) return null;

  const fullStars = Math.floor(rating);
  const remainder = rating - fullStars;

  const starSize = size === 'md' ? 'h-4 w-4' : 'h-3 w-3';
  const textSize = size === 'md' ? 'ml-1.5 text-sm' : 'ml-1 text-xs';

  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => {
        if (i < fullStars) return <StarIcon key={i} filled={true} sizeClass={starSize} />;

        // Half-star: clip-path shows left half filled, right half empty
        if (i === fullStars && remainder >= 0.25) {
          return (
            <span key={i} className={`relative inline-block ${starSize}`} aria-hidden="true">
              <Star className={`absolute inset-0 ${starSize} text-neutral-200`} fill="currentColor" />
              <span className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
                <Star className={`${starSize} text-amber-400`} fill="currentColor" />
              </span>
            </span>
          );
        }

        return <StarIcon key={i} filled={false} sizeClass={starSize} />;
      })}
      <span className={`${textSize} text-neutral-400`}>{rating.toFixed(1)}</span>
    </div>
  );
}
