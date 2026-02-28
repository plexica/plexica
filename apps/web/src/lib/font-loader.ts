// File: apps/web/src/lib/font-loader.ts
//
// Self-hosted font loading via FontFace API (ADR-020).
//
// All fonts are loaded from same origin (/fonts/{id}/{id}-{weight}.woff2).
// No requests are ever made to fonts.googleapis.com or fonts.gstatic.com.
//
// Public API:
//   loadFonts({ heading, body })  — load both tenant fonts, set CSS vars
//   preloadFont(fontIdOrName)     — inject <link rel="preload"> hint
//   getManifest()                 — fetch manifest.json (cached per session)
//   isFontLoaded(family)          — check document.fonts for a loaded family

import { z } from 'zod';
import { FONT_CATALOG, DEFAULT_HEADING_FONT, DEFAULT_BODY_FONT } from '@plexica/types';
import type { FontDefinition, FontManifest } from '@plexica/types';

// ---------------------------------------------------------------------------
// Zod validation — only allow font IDs present in FONT_CATALOG
// ---------------------------------------------------------------------------

const FONT_ID_SET = new Set(FONT_CATALOG.map((f) => f.id));
// Also allow font display names (e.g. "Inter" from ThemeContext defaults)
const FONT_NAME_MAP = new Map(FONT_CATALOG.map((f) => [f.name.toLowerCase(), f.id]));

const fontIdSchema = z
  .string()
  .transform((val) => {
    // Accept kebab-case IDs directly
    if (FONT_ID_SET.has(val)) return val;
    // Accept display names (case-insensitive): "Inter" → "inter"
    const byName = FONT_NAME_MAP.get(val.toLowerCase());
    if (byName) return byName;
    return val; // Will fail refine below
  })
  .refine((val) => FONT_ID_SET.has(val), {
    message: `Font ID must be one of the ADR-020 curated font IDs`,
  });

// ---------------------------------------------------------------------------
// Module-level manifest cache (one fetch per page session)
// ---------------------------------------------------------------------------

let manifestCache: FontManifest | null = null;

// ---------------------------------------------------------------------------
// getManifest
// ---------------------------------------------------------------------------

/**
 * Fetch /fonts/manifest.json exactly once per page session.
 * Subsequent calls return the cached result.
 */
export async function getManifest(): Promise<FontManifest> {
  if (manifestCache) return manifestCache;

  const response = await fetch('/fonts/manifest.json');
  if (!response.ok) {
    throw new Error(`Failed to fetch font manifest: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as FontManifest;
  manifestCache = data;
  return data;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getFontDefinition(fontId: string): FontDefinition | undefined {
  return FONT_CATALOG.find((f) => f.id === fontId);
}

// Track which font IDs have been loaded to avoid duplicate FontFace registrations
const loadedFontIds = new Set<string>();

async function loadSingleFont(fontId: string): Promise<void> {
  if (loadedFontIds.has(fontId)) return;

  const def = getFontDefinition(fontId);
  if (!def) {
    console.warn(`[font-loader] Unknown font ID "${fontId}" — skipping`);
    return;
  }

  const loadPromises = def.weights.map(async (weight) => {
    const url = `/fonts/${def.id}/${def.id}-${weight}.woff2`;
    try {
      const fontFace = new FontFace(def.name, `url(${url}) format('woff2')`, {
        weight: String(weight),
        display: 'swap',
      });
      await fontFace.load();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document.fonts as any).add(fontFace);
    } catch (err) {
      // Non-fatal: log warn but do not re-throw (ADR-020 §Failure handling)
      console.warn(
        `[font-loader] Failed to load ${def.name} weight ${weight}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  await Promise.allSettled(loadPromises);
  loadedFontIds.add(fontId);
}

// ---------------------------------------------------------------------------
// loadFonts
// ---------------------------------------------------------------------------

/**
 * Load heading and body fonts for the current tenant theme.
 * Sets --font-heading and --font-body CSS custom properties on :root.
 *
 * Accepts either kebab-case font IDs ("inter") or display names ("Inter").
 * Invalid font IDs are rejected by Zod validation; falls back to defaults
 * without throwing.
 */
export async function loadFonts({
  heading,
  body,
}: {
  heading: string;
  body: string;
}): Promise<void> {
  // Validate + normalise both IDs
  let headingId: string;
  let bodyId: string;

  const headingResult = fontIdSchema.safeParse(heading);
  const bodyResult = fontIdSchema.safeParse(body);

  if (!headingResult.success) {
    console.warn(
      `[font-loader] Invalid heading font "${heading}" — falling back to "${DEFAULT_HEADING_FONT}"`
    );
    headingId = DEFAULT_HEADING_FONT;
  } else {
    headingId = headingResult.data;
  }

  if (!bodyResult.success) {
    console.warn(
      `[font-loader] Invalid body font "${body}" — falling back to "${DEFAULT_BODY_FONT}"`
    );
    bodyId = DEFAULT_BODY_FONT;
  } else {
    bodyId = bodyResult.data;
  }

  // Deduplicate: if heading === body, load only once
  const uniqueIds = [...new Set([headingId, bodyId])];
  await Promise.allSettled(uniqueIds.map((id) => loadSingleFont(id)));

  // Set CSS custom properties on :root (ADR-020 §CSS Integration)
  const headingDef = getFontDefinition(headingId) ?? getFontDefinition(DEFAULT_HEADING_FONT)!;
  const bodyDef = getFontDefinition(bodyId) ?? getFontDefinition(DEFAULT_BODY_FONT)!;

  document.documentElement.style.setProperty(
    '--font-heading',
    `"${headingDef.name}", ${headingDef.fallback}`
  );
  document.documentElement.style.setProperty(
    '--font-body',
    `"${bodyDef.name}", ${bodyDef.fallback}`
  );
}

// ---------------------------------------------------------------------------
// preloadFont
// ---------------------------------------------------------------------------

const preloadedFontIds = new Set<string>();

/**
 * Inject a <link rel="preload"> hint for the 400-weight WOFF2 of a font.
 * No-ops if a hint for this font is already present.
 * Accepts either font ID or display name.
 */
export function preloadFont(fontIdOrName: string): void {
  const result = fontIdSchema.safeParse(fontIdOrName);
  if (!result.success) {
    console.warn(`[font-loader] preloadFont: unknown font "${fontIdOrName}" — skipping`);
    return;
  }
  const fontId = result.data;
  if (preloadedFontIds.has(fontId)) return;

  const def = getFontDefinition(fontId);
  if (!def) return;

  // Use weight 400 for preload hint (most critical weight)
  const baseWeight = def.weights.includes(400) ? 400 : def.weights[0];
  const href = `/fonts/${def.id}/${def.id}-${baseWeight}.woff2`;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  link.setAttribute('as', 'font');
  link.type = 'font/woff2';
  link.setAttribute('crossorigin', 'anonymous');
  document.head.appendChild(link);

  preloadedFontIds.add(fontId);
}

// ---------------------------------------------------------------------------
// isFontLoaded
// ---------------------------------------------------------------------------

/**
 * Returns true when a font with the given family name is available in
 * document.fonts (i.e. has been successfully loaded and added).
 * Accepts either a font ID ("inter") or a display name ("Inter").
 */
export function isFontLoaded(familyOrId: string): boolean {
  // Resolve to display name for document.fonts check
  const def = FONT_CATALOG.find(
    (f) => f.id === familyOrId || f.name.toLowerCase() === familyOrId.toLowerCase()
  );
  const family = def ? def.name : familyOrId;

  // document.fonts.check returns true if the font is available
  try {
    return document.fonts.check(`16px "${family}"`);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// resetForTesting (only for unit tests)
// ---------------------------------------------------------------------------

/** @internal — reset module-level caches for test isolation */
export function _resetForTesting(): void {
  manifestCache = null;
  loadedFontIds.clear();
  preloadedFontIds.clear();
}
