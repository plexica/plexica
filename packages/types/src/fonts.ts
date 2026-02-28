// File: packages/types/src/fonts.ts
//
// Font type definitions for the Plexica self-hosted font system (ADR-020).
// Used by font-loader.ts, FontSelector, and ThemeContext across apps.

/**
 * A single font definition from the curated ADR-020 font catalog.
 * Mirrors the structure in apps/web/public/fonts/manifest.json.
 */
export interface FontDefinition {
  /** Kebab-case identifier used in URLs: "inter", "open-sans" */
  id: string;
  /** Human-readable display name: "Inter", "Open Sans" */
  name: string;
  /** Typography category for grouping in FontSelector */
  category: 'sans-serif' | 'serif' | 'monospace' | 'display';
  /** Available font weights: e.g. [400, 500, 600, 700] */
  weights: number[];
  /** Open-source license: "SIL OFL 1.1" | "Apache 2.0" */
  license: string;
  /** CSS fallback font stack used when the font fails to load */
  fallback: string;
  /** Map of weight to relative path under /fonts/: { "400": "inter/inter-400.woff2" } */
  files: Record<string, string>;
}

/**
 * Structure of apps/web/public/fonts/manifest.json
 */
export interface FontManifest {
  version: 1;
  fonts: FontDefinition[];
}

/**
 * All 25 curated fonts from ADR-020 (self-hosted WOFF2, SIL OFL or Apache 2.0).
 * Used for Zod validation in font-loader.ts to prevent loading unknown fonts.
 */
export const FONT_CATALOG: FontDefinition[] = [
  // --- Sans-serif ---
  {
    id: 'inter',
    name: 'Inter',
    category: 'sans-serif',
    weights: [400, 500, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'inter/inter-400.woff2',
      '500': 'inter/inter-500.woff2',
      '600': 'inter/inter-600.woff2',
      '700': 'inter/inter-700.woff2',
    },
  },
  {
    id: 'roboto',
    name: 'Roboto',
    category: 'sans-serif',
    weights: [400, 500, 700],
    license: 'Apache 2.0',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'roboto/roboto-400.woff2',
      '500': 'roboto/roboto-500.woff2',
      '700': 'roboto/roboto-700.woff2',
    },
  },
  {
    id: 'open-sans',
    name: 'Open Sans',
    category: 'sans-serif',
    weights: [400, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'open-sans/open-sans-400.woff2',
      '600': 'open-sans/open-sans-600.woff2',
      '700': 'open-sans/open-sans-700.woff2',
    },
  },
  {
    id: 'lato',
    name: 'Lato',
    category: 'sans-serif',
    weights: [400, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'lato/lato-400.woff2',
      '700': 'lato/lato-700.woff2',
    },
  },
  {
    id: 'source-sans-3',
    name: 'Source Sans 3',
    category: 'sans-serif',
    weights: [400, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'source-sans-3/source-sans-3-400.woff2',
      '600': 'source-sans-3/source-sans-3-600.woff2',
      '700': 'source-sans-3/source-sans-3-700.woff2',
    },
  },
  {
    id: 'nunito',
    name: 'Nunito',
    category: 'sans-serif',
    weights: [400, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'nunito/nunito-400.woff2',
      '600': 'nunito/nunito-600.woff2',
      '700': 'nunito/nunito-700.woff2',
    },
  },
  {
    id: 'poppins',
    name: 'Poppins',
    category: 'sans-serif',
    weights: [400, 500, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'poppins/poppins-400.woff2',
      '500': 'poppins/poppins-500.woff2',
      '600': 'poppins/poppins-600.woff2',
      '700': 'poppins/poppins-700.woff2',
    },
  },
  {
    id: 'work-sans',
    name: 'Work Sans',
    category: 'sans-serif',
    weights: [400, 500, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'work-sans/work-sans-400.woff2',
      '500': 'work-sans/work-sans-500.woff2',
      '600': 'work-sans/work-sans-600.woff2',
      '700': 'work-sans/work-sans-700.woff2',
    },
  },
  {
    id: 'dm-sans',
    name: 'DM Sans',
    category: 'sans-serif',
    weights: [400, 500, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'dm-sans/dm-sans-400.woff2',
      '500': 'dm-sans/dm-sans-500.woff2',
      '700': 'dm-sans/dm-sans-700.woff2',
    },
  },
  {
    id: 'plus-jakarta-sans',
    name: 'Plus Jakarta Sans',
    category: 'sans-serif',
    weights: [400, 500, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'plus-jakarta-sans/plus-jakarta-sans-400.woff2',
      '500': 'plus-jakarta-sans/plus-jakarta-sans-500.woff2',
      '600': 'plus-jakarta-sans/plus-jakarta-sans-600.woff2',
      '700': 'plus-jakarta-sans/plus-jakarta-sans-700.woff2',
    },
  },
  {
    id: 'noto-sans',
    name: 'Noto Sans',
    category: 'sans-serif',
    weights: [400, 500, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'noto-sans/noto-sans-400.woff2',
      '500': 'noto-sans/noto-sans-500.woff2',
      '700': 'noto-sans/noto-sans-700.woff2',
    },
  },
  {
    id: 'manrope',
    name: 'Manrope',
    category: 'sans-serif',
    weights: [400, 500, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'manrope/manrope-400.woff2',
      '500': 'manrope/manrope-500.woff2',
      '600': 'manrope/manrope-600.woff2',
      '700': 'manrope/manrope-700.woff2',
    },
  },
  {
    id: 'figtree',
    name: 'Figtree',
    category: 'sans-serif',
    weights: [400, 500, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
    files: {
      '400': 'figtree/figtree-400.woff2',
      '500': 'figtree/figtree-500.woff2',
      '600': 'figtree/figtree-600.woff2',
      '700': 'figtree/figtree-700.woff2',
    },
  },
  // --- Serif ---
  {
    id: 'merriweather',
    name: 'Merriweather',
    category: 'serif',
    weights: [400, 700],
    license: 'SIL OFL 1.1',
    fallback: "Georgia, 'Times New Roman', serif",
    files: {
      '400': 'merriweather/merriweather-400.woff2',
      '700': 'merriweather/merriweather-700.woff2',
    },
  },
  {
    id: 'playfair-display',
    name: 'Playfair Display',
    category: 'serif',
    weights: [400, 700],
    license: 'SIL OFL 1.1',
    fallback: "Georgia, 'Times New Roman', serif",
    files: {
      '400': 'playfair-display/playfair-display-400.woff2',
      '700': 'playfair-display/playfair-display-700.woff2',
    },
  },
  {
    id: 'lora',
    name: 'Lora',
    category: 'serif',
    weights: [400, 700],
    license: 'SIL OFL 1.1',
    fallback: "Georgia, 'Times New Roman', serif",
    files: {
      '400': 'lora/lora-400.woff2',
      '700': 'lora/lora-700.woff2',
    },
  },
  {
    id: 'source-serif-4',
    name: 'Source Serif 4',
    category: 'serif',
    weights: [400, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: "Georgia, 'Times New Roman', serif",
    files: {
      '400': 'source-serif-4/source-serif-4-400.woff2',
      '600': 'source-serif-4/source-serif-4-600.woff2',
      '700': 'source-serif-4/source-serif-4-700.woff2',
    },
  },
  {
    id: 'bitter',
    name: 'Bitter',
    category: 'serif',
    weights: [400, 700],
    license: 'SIL OFL 1.1',
    fallback: "Georgia, 'Times New Roman', serif",
    files: {
      '400': 'bitter/bitter-400.woff2',
      '700': 'bitter/bitter-700.woff2',
    },
  },
  // --- Monospace ---
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    category: 'monospace',
    weights: [400, 700],
    license: 'SIL OFL 1.1',
    fallback: "'Courier New', Courier, monospace",
    files: {
      '400': 'jetbrains-mono/jetbrains-mono-400.woff2',
      '700': 'jetbrains-mono/jetbrains-mono-700.woff2',
    },
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    category: 'monospace',
    weights: [400, 700],
    license: 'SIL OFL 1.1',
    fallback: "'Courier New', Courier, monospace",
    files: {
      '400': 'fira-code/fira-code-400.woff2',
      '700': 'fira-code/fira-code-700.woff2',
    },
  },
  {
    id: 'source-code-pro',
    name: 'Source Code Pro',
    category: 'monospace',
    weights: [400, 700],
    license: 'SIL OFL 1.1',
    fallback: "'Courier New', Courier, monospace",
    files: {
      '400': 'source-code-pro/source-code-pro-400.woff2',
      '700': 'source-code-pro/source-code-pro-700.woff2',
    },
  },
  // --- Display ---
  {
    id: 'outfit',
    name: 'Outfit',
    category: 'display',
    weights: [400, 500, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, sans-serif',
    files: {
      '400': 'outfit/outfit-400.woff2',
      '500': 'outfit/outfit-500.woff2',
      '600': 'outfit/outfit-600.woff2',
      '700': 'outfit/outfit-700.woff2',
    },
  },
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    category: 'display',
    weights: [400, 500, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, sans-serif',
    files: {
      '400': 'space-grotesk/space-grotesk-400.woff2',
      '500': 'space-grotesk/space-grotesk-500.woff2',
      '700': 'space-grotesk/space-grotesk-700.woff2',
    },
  },
  {
    id: 'sora',
    name: 'Sora',
    category: 'display',
    weights: [400, 500, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, sans-serif',
    files: {
      '400': 'sora/sora-400.woff2',
      '500': 'sora/sora-500.woff2',
      '600': 'sora/sora-600.woff2',
      '700': 'sora/sora-700.woff2',
    },
  },
  {
    id: 'rubik',
    name: 'Rubik',
    category: 'display',
    weights: [400, 500, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, sans-serif',
    files: {
      '400': 'rubik/rubik-400.woff2',
      '500': 'rubik/rubik-500.woff2',
      '700': 'rubik/rubik-700.woff2',
    },
  },
  {
    id: 'raleway',
    name: 'Raleway',
    category: 'display',
    weights: [400, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, sans-serif',
    files: {
      '400': 'raleway/raleway-400.woff2',
      '600': 'raleway/raleway-600.woff2',
      '700': 'raleway/raleway-700.woff2',
    },
  },
];

/** Default heading font ID (ADR-020) */
export const DEFAULT_HEADING_FONT = 'inter';

/** Default body font ID (ADR-020) */
export const DEFAULT_BODY_FONT = 'roboto';

/** Set of all valid font IDs — used for Zod validation in font-loader.ts */
export const FONT_IDS = FONT_CATALOG.map((f) => f.id) as [string, ...string[]];
