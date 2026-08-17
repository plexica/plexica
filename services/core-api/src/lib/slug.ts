// slug.ts
// Slug generation and validation for tenants, workspaces, and plugins.
//
// Two canonical regexes with intentionally different bounds — do NOT merge them:
//
// TENANT_SLUG_REGEX (3–51 chars, no trailing hyphen): tenant slugs feed
// toSchemaName() (`tenant_` + slug). Max 51 keeps the schema identifier at
// 7 + 51 = 58 chars, safely under PostgreSQL's NAMEDATALEN=64. A longer slug
// would be silently truncated by PostgreSQL and two tenants could collide on
// the same schema — a critical tenant-isolation violation.
// (M-02: the original spec wrote /^[a-z][a-z0-9-]{1,62}$/; the 51-char limit
// is a deliberate, documented tightening — see decision log.)
//
// RESOURCE_SLUG_REGEX (2–63 chars): workspace and plugin slugs never become
// PostgreSQL identifiers, so they keep the original looser bound.

/** Tenant slug: 3–51 chars, starts with a letter, lowercase alphanumeric + hyphens, ends alphanumeric. */
export const TENANT_SLUG_REGEX = /^[a-z][a-z0-9-]{1,49}[a-z0-9]$/;

/** Workspace/plugin slug: 2–63 chars, starts with a letter, lowercase alphanumeric + hyphens. */
export const RESOURCE_SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;

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

  // Truncate to 63 chars (RESOURCE_SLUG_REGEX allows up to 63 total)
  slug = slug.slice(0, 63);

  // Ensure minimum length of 2 (RESOURCE_SLUG_REGEX requires [a-z][a-z0-9-]{1,62})
  // Example: generateSlug('A') → 'a' (1 char) → pad to 'a0'
  if (slug.length < 2) {
    slug = `${slug}0`;
  }

  return slug;
}
