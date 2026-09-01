// cn.ts — Tailwind class merging utility

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes with proper precedence handling.
 * Combines clsx for conditional classes and tailwind-merge for conflict resolution.
 *
 * @param inputs - Class values (strings, objects, arrays) to merge
 * @returns Merged class string with Tailwind conflicts resolved
 *
 * @example
 * cn('px-2 py-1', { 'bg-red-500': isError }, ['rounded'])
 * // => isError ? 'px-2 py-1 bg-red-500 rounded' : 'px-2 py-1 rounded'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
