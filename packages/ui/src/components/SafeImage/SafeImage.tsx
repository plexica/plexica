// File: packages/ui/src/components/SafeImage/SafeImage.tsx
// T015-25: Reusable <SafeImage> component that validates src URLs before
// rendering an <img> element. Prevents XSS via unsafe src attributes.
// Spec 015 FR-025.

import * as React from 'react';
import type { ImgHTMLAttributes } from 'react';
import { validateImageUrl } from '../../utils/validate-image-url.js';

export interface SafeImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** The image source URL. Will be validated before use. */
  src: string;
  /**
   * Fallback content rendered when `src` fails validation (e.g., `javascript:`
   * URLs, empty strings, or unsupported schemes). Defaults to `null` (renders
   * nothing).
   */
  fallback?: React.ReactNode;
}

/**
 * A secure replacement for `<img>` that validates the `src` URL scheme
 * before rendering. Rejects `javascript:`, `data:text/html`, and
 * `data:application/` URIs. Allows `https://`, `http://`, and `data:image/`.
 *
 * @example
 * // Renders the image normally
 * <SafeImage src="https://cdn.example.com/logo.png" alt="Logo" />
 *
 * @example
 * // Renders the fallback (src is rejected)
 * <SafeImage
 *   src="javascript:alert(1)"
 *   fallback={<span>Invalid logo URL</span>}
 * />
 *
 * @example
 * // Renders nothing (no fallback provided, src is rejected)
 * <SafeImage src="" />
 */
export function SafeImage({ src, fallback = null, ...props }: SafeImageProps) {
  const safeSrc = validateImageUrl(src);
  if (!safeSrc) {
    return <>{fallback}</>;
  }
  // Destructure dangerouslySetInnerHTML out of props so it cannot be passed
  // through the spread to the <img> element (CodeQL js/xss-through-dom guard).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dangerouslySetInnerHTML: _ignored, ...safeProps } = props as typeof props & {
    dangerouslySetInnerHTML?: unknown;
  };
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={safeSrc} {...safeProps} />;
}
