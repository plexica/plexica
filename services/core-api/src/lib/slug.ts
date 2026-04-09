// slug.ts
// Slug generation and validation for workspaces and tenants.

/** Valid slug: starts with a lowercase letter, 2-63 chars, only lowercase alphanumeric and hyphens. */
export const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;

/**
 * Converts a display name into a URL-safe slug.
 * Examples:
 *   "My Workspace!" -> "my-workspace"
 *   "123 Numbers"   -> "w123-numbers"
 */
export function generateSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric → hyphen
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // strip leading/trailing hyphens

  // Ensure starts with a letter (prepend 'w' if it starts with a digit or is empty)
  if (slug === '' || !/^[a-z]/.test(slug)) {
    slug = `w${slug}`;
  }

  // Truncate to 63 chars (SLUG_REGEX allows up to 63 total: 1 leading letter + up to 62 more)
  slug = slug.slice(0, 63);

  // Ensure minimum length of 2 (SLUG_REGEX requires [a-z][a-z0-9-]{1,62})
  // Example: generateSlug('A') → 'a' (1 char) → pad to 'a0'
  if (slug.length < 2) {
    slug = `${slug}0`;
  }

  return slug;
}

/** Returns true if the slug matches SLUG_REGEX. */
export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}
