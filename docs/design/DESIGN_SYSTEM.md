# Plexica Design System

**Date**: February 10, 2026
**Status**: Active
**Version**: 1.0
**Package**: `@plexica/ui`

---

## Overview

The Plexica Design System provides a unified visual language across all Plexica applications (web, super-admin) and plugins. It is built on:

- **Tailwind CSS v4** with oklch color tokens
- **Radix UI** primitives for accessible, unstyled components
- **class-variance-authority (CVA)** for variant management
- **JetBrains Mono Variable** as the sole typeface (monospace)

All tokens are defined as CSS custom properties in `packages/ui/src/styles/globals.css` and mapped to Tailwind via the `@theme inline` block.

---

## Color Palette

The color system uses the **oklch** color space for perceptually uniform color manipulation. Colors are defined as CSS custom properties and automatically switch between light and dark themes via the `.dark` class.

### Semantic Colors

| Token                    | Purpose                | Light Value                    | Dark Value                      |
| ------------------------ | ---------------------- | ------------------------------ | ------------------------------- |
| `--background`           | Page background        | `oklch(1 0 0)` (white)         | `oklch(0.145 0 0)` (near-black) |
| `--foreground`           | Default text           | `oklch(0.145 0 0)`             | `oklch(0.985 0 0)`              |
| `--primary`              | Primary actions, links | `oklch(0.205 0 0)` (very dark) | `oklch(0.87 0 0)` (light gray)  |
| `--primary-foreground`   | Text on primary bg     | `oklch(0.985 0 0)`             | `oklch(0.205 0 0)`              |
| `--secondary`            | Secondary elements     | `oklch(0.97 0 0)` (light gray) | `oklch(0.269 0 0)`              |
| `--secondary-foreground` | Text on secondary bg   | `oklch(0.205 0 0)`             | `oklch(0.985 0 0)`              |
| `--muted`                | Muted backgrounds      | `oklch(0.97 0 0)`              | `oklch(0.269 0 0)`              |
| `--muted-foreground`     | Subdued text           | `oklch(0.556 0 0)`             | `oklch(0.708 0 0)`              |
| `--accent`               | Accent highlights      | `oklch(0.97 0 0)`              | `oklch(0.371 0 0)`              |
| `--accent-foreground`    | Text on accent bg      | `oklch(0.205 0 0)`             | `oklch(0.985 0 0)`              |
| `--destructive`          | Destructive actions    | `oklch(0.58 0.22 27)` (red)    | `oklch(0.704 0.191 22.216)`     |

### Surface Colors

| Token                  | Purpose             | Light Value        | Dark Value         |
| ---------------------- | ------------------- | ------------------ | ------------------ |
| `--card`               | Card background     | `oklch(1 0 0)`     | `oklch(0.205 0 0)` |
| `--card-foreground`    | Card text           | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--popover`            | Popover/dropdown bg | `oklch(1 0 0)`     | `oklch(0.205 0 0)` |
| `--popover-foreground` | Popover text        | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |

### Border & Input Colors

| Token      | Purpose        | Light Value        | Dark Value           |
| ---------- | -------------- | ------------------ | -------------------- |
| `--border` | Default border | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` |
| `--input`  | Input borders  | `oklch(0.922 0 0)` | `oklch(1 0 0 / 15%)` |
| `--ring`   | Focus ring     | `oklch(0.708 0 0)` | `oklch(0.556 0 0)`   |

### Chart Colors

Used for data visualizations. The palette progresses from light blue to deep purple:

| Token       | Value                        | Approx. Color |
| ----------- | ---------------------------- | ------------- |
| `--chart-1` | `oklch(0.809 0.105 251.813)` | Light blue    |
| `--chart-2` | `oklch(0.623 0.214 259.815)` | Medium blue   |
| `--chart-3` | `oklch(0.546 0.245 262.881)` | Blue-purple   |
| `--chart-4` | `oklch(0.488 0.243 264.376)` | Purple        |
| `--chart-5` | `oklch(0.424 0.199 265.638)` | Deep purple   |

### Sidebar Colors

Dedicated tokens for the sidebar component, allowing independent theming:

| Token                          | Purpose        | Light              | Dark                         |
| ------------------------------ | -------------- | ------------------ | ---------------------------- |
| `--sidebar`                    | Sidebar bg     | `oklch(0.985 0 0)` | `oklch(0.205 0 0)`           |
| `--sidebar-foreground`         | Sidebar text   | `oklch(0.145 0 0)` | `oklch(0.985 0 0)`           |
| `--sidebar-primary`            | Active item    | `oklch(0.205 0 0)` | `oklch(0.488 0.243 264.376)` |
| `--sidebar-primary-foreground` | Active text    | `oklch(0.985 0 0)` | `oklch(0.985 0 0)`           |
| `--sidebar-accent`             | Hover bg       | `oklch(0.97 0 0)`  | `oklch(0.269 0 0)`           |
| `--sidebar-accent-foreground`  | Hover text     | `oklch(0.205 0 0)` | `oklch(0.985 0 0)`           |
| `--sidebar-border`             | Sidebar border | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)`         |
| `--sidebar-ring`               | Sidebar focus  | `oklch(0.708 0 0)` | `oklch(0.556 0 0)`           |

### Status Colors (Component-Level)

These are NOT defined as CSS custom properties but are used directly as Tailwind classes within components:

| Status       | Tailwind Class                                    | Usage                                |
| ------------ | ------------------------------------------------- | ------------------------------------ |
| Success      | `bg-green-500 text-white`                         | Badge `success` variant              |
| Warning      | `bg-orange-500 text-white`                        | Badge `warning` variant              |
| Danger/Error | `bg-red-500 text-white` / `bg-red-600 text-white` | Badge `danger`, Button `destructive` |

### Usage in Tailwind Classes

Thanks to the `@theme inline` block, all tokens are available as Tailwind utility classes:

```tsx
// Background colors
<div className="bg-background" />      // Page background
<div className="bg-card" />            // Card background
<div className="bg-primary" />         // Primary color
<div className="bg-muted" />           // Muted background
<div className="bg-destructive" />     // Destructive/error

// Text colors
<p className="text-foreground" />       // Default text
<p className="text-muted-foreground" /> // Subdued text
<p className="text-primary" />          // Primary-colored text

// Border colors
<div className="border-border" />       // Default border
<div className="border-input" />        // Input border

// Focus ring
<div className="ring-ring" />           // Focus ring color
```

### When to Use Each Color

| Scenario                           | Token                                |
| ---------------------------------- | ------------------------------------ |
| Page background                    | `background`                         |
| Card/panel background              | `card`                               |
| Primary buttons, active states     | `primary` / `primary-foreground`     |
| Secondary buttons, less emphasis   | `secondary` / `secondary-foreground` |
| Subtle backgrounds, disabled areas | `muted` / `muted-foreground`         |
| Hover states, selected items       | `accent` / `accent-foreground`       |
| Delete, error, warning actions     | `destructive`                        |
| Borders, dividers                  | `border`                             |
| Form input borders                 | `input`                              |
| Focus indicators                   | `ring`                               |

---

## Typography

### Typeface

The design system uses a single typeface: **JetBrains Mono Variable** (monospace).

- **Package**: `@fontsource-variable/jetbrains-mono`
- **CSS variable**: `--font-sans: 'JetBrains Mono Variable', monospace`
- **Tailwind class**: `font-sans` (configured via `@theme inline`)

All text in the application uses this monospace font. There are no serif or secondary fonts.

### Type Scale

The type scale is defined in the Tailwind config:

| Name  | Size | Line Height | Weight         | Tailwind Class |
| ----- | ---- | ----------- | -------------- | -------------- |
| H1    | 28px | 1.4         | 600 (semibold) | `text-h1`      |
| H2    | 24px | 1.4         | 600 (semibold) | `text-h2`      |
| H3    | 20px | 1.4         | 600 (semibold) | `text-h3`      |
| Body  | 14px | 1.5         | 400 (normal)   | `text-body`    |
| Small | 12px | 1.5         | 400 (normal)   | `text-small`   |
| Code  | 14px | 1.5         | 400 (normal)   | `text-code`    |

Additional standard Tailwind sizes are available: `text-xs` (12px), `text-sm` (14px), `text-base` (16px), `text-lg` (18px).

### Font Weights

| Weight   | Value | Usage                              |
| -------- | ----- | ---------------------------------- |
| Normal   | 400   | Body text, descriptions            |
| Medium   | 500   | Labels, emphasis                   |
| Semibold | 600   | Headings, card titles, button text |

### Usage Guidelines

```tsx
// Headings
<h1 className="text-h1">Page Title</h1>
<h2 className="text-h2">Section Title</h2>
<h3 className="text-h3 font-semibold leading-none tracking-tight">Card Title</h3>

// Body text
<p className="text-sm">Standard body text</p>
<p className="text-sm text-muted-foreground">Secondary text</p>

// Small/helper text
<span className="text-xs">Helper or meta text</span>
```

---

## Spacing

The spacing system follows Tailwind's default scale (4px base unit) with named aliases:

| Name | Value | Tailwind Class     | Usage                          |
| ---- | ----- | ------------------ | ------------------------------ |
| xs   | 4px   | `p-xs` / `gap-1`   | Minimal spacing, icon gaps     |
| sm   | 8px   | `p-sm` / `gap-2`   | Tight spacing, badge padding   |
| md   | 16px  | `p-md` / `gap-4`   | Standard spacing, card padding |
| lg   | 24px  | `p-lg` / `gap-6`   | Section spacing, card headers  |
| xl   | 32px  | `p-xl` / `gap-8`   | Large section spacing          |
| xxl  | 48px  | `p-xxl` / `gap-12` | Page-level spacing             |

### Component-Specific Spacing

| Component    | Padding          | Spacing                          |
| ------------ | ---------------- | -------------------------------- |
| Card header  | `p-6` (24px)     | `space-y-1.5` between title/desc |
| Card content | `p-6 pt-0`       | --                               |
| Card footer  | `p-6 pt-0`       | --                               |
| Button sm    | `h-8 px-3`       | --                               |
| Button md    | `h-10 px-4`      | --                               |
| Button lg    | `h-12 px-6`      | --                               |
| Input        | `h-10 px-3 py-2` | --                               |
| Alert        | `p-4`            | `pl-7` for text after icon       |
| Badge        | `px-2.5 py-0.5`  | --                               |

---

## Border Radius

The radius system is computed from a base `--radius` variable, currently set to `0` (sharp corners).

| Token          | Computation       | Value (base=0) | Tailwind Class |
| -------------- | ----------------- | -------------- | -------------- |
| `--radius-sm`  | `--radius - 4px`  | -4px           | `rounded-sm`   |
| `--radius-md`  | `--radius - 2px`  | -2px           | `rounded-md`   |
| `--radius-lg`  | `--radius`        | 0px            | `rounded-lg`   |
| `--radius-xl`  | `--radius + 4px`  | 4px            | `rounded-xl`   |
| `--radius-2xl` | `--radius + 8px`  | 8px            | `rounded-2xl`  |
| `--radius-3xl` | `--radius + 12px` | 12px           | `rounded-3xl`  |
| `--radius-4xl` | `--radius + 16px` | 16px           | `rounded-4xl`  |

To enable rounded corners globally, increase `--radius` in `globals.css`. For example, `--radius: 0.5rem` gives standard rounded corners.

**Note**: With `--radius: 0`, the design uses sharp/square corners. Components that explicitly use `rounded-full` (e.g., Badge, Spinner) override this.

### Usage by Component

| Component | Radius Class    | Notes                     |
| --------- | --------------- | ------------------------- |
| Button    | `rounded-md`    | Follows radius scale      |
| Card      | `rounded-lg`    | Follows radius scale      |
| Input     | `rounded-md`    | Follows radius scale      |
| Badge     | `rounded-full`  | Always pill-shaped        |
| Spinner   | `rounded-full`  | Always circular           |
| Alert     | `rounded-lg`    | Follows radius scale      |
| Modal     | `sm:rounded-lg` | Rounded on larger screens |

---

## Shadows

A single shadow level is defined:

| Name | Value                          | Tailwind Class |
| ---- | ------------------------------ | -------------- |
| sm   | `0 2px 8px rgba(0, 0, 0, 0.1)` | `shadow-sm`    |

Components that use shadows:

- **Card**: `shadow-sm`
- **Modal**: `shadow-lg` (Tailwind default)

---

## Iconography

### Library

All icons come from **Lucide React** (`lucide-react`).

### Conventions

| Context           | Size                  | Stroke Width | Example                    |
| ----------------- | --------------------- | ------------ | -------------------------- |
| Inline with text  | `h-4 w-4` (16px)      | Default (2)  | Sort arrows, close buttons |
| Button icon       | `h-4 w-4`             | Default (2)  | Chevron in pagination      |
| Status indicator  | `h-4 w-4`             | Default (2)  | Alert icons                |
| Large/empty state | `h-12 w-12` or larger | Default (2)  | Empty state illustrations  |

### Common Icons

| Icon                           | Import         | Usage                    |
| ------------------------------ | -------------- | ------------------------ |
| `X`                            | `lucide-react` | Close/dismiss buttons    |
| `ChevronLeft` / `ChevronRight` | `lucide-react` | Pagination, navigation   |
| `ArrowUpDown`                  | `lucide-react` | Sortable columns         |
| `AlertCircle`                  | `lucide-react` | Warning alerts           |
| `CheckCircle2`                 | `lucide-react` | Success alerts           |
| `Info`                         | `lucide-react` | Info alerts, default     |
| `XCircle`                      | `lucide-react` | Error/destructive alerts |

### Usage

```tsx
import { X, ChevronLeft, Info } from 'lucide-react';

// Standard inline icon
<X className="h-4 w-4" />

// Icon with semantic color
<Info className="h-4 w-4 text-blue-500" />

// Icon button
<Button variant="ghost" size="icon">
  <X className="h-4 w-4" />
</Button>
```

---

## Light/Dark Theme

### How it Works

Theme switching uses a **CSS class strategy**:

1. The `.dark` class is applied to a parent element (typically `<html>` or `<body>`)
2. The `@custom-variant dark (&:is(.dark *))` directive in Tailwind v4 enables `dark:` variants
3. CSS custom properties automatically switch values when `.dark` is active

### Token Mapping Summary

| Semantic Role | Light              | Dark             |
| ------------- | ------------------ | ---------------- |
| Background    | White              | Near-black       |
| Text          | Near-black         | Near-white       |
| Primary       | Very dark gray     | Light gray       |
| Cards         | White              | Dark gray (#333) |
| Borders       | Light gray (solid) | White 10% alpha  |
| Input borders | Light gray (solid) | White 15% alpha  |
| Destructive   | Muted red          | Brighter red     |

### For Plugin Developers

Plugins loaded via Module Federation inherit the host's CSS custom properties because they render in the same DOM tree. To ensure dark mode support:

1. Use semantic color classes (`bg-background`, `text-foreground`) instead of hardcoded colors
2. Use the design tokens (`bg-primary`, `text-muted-foreground`) rather than raw color values
3. Never use `bg-white` or `text-black` -- use `bg-background` and `text-foreground`
4. The `dark:` variant prefix works in plugin components

---

## Variant Naming Conventions

### When to Use Which Variant Name

| Variant Name  | Meaning                       | Used In              |
| ------------- | ----------------------------- | -------------------- |
| `default`     | Standard/neutral appearance   | Button, Badge, Alert |
| `primary`     | Same as default (alias)       | Button               |
| `secondary`   | Reduced emphasis              | Button, Badge        |
| `destructive` | Dangerous/irreversible action | Button, Alert        |
| `danger`      | Same as destructive (alias)   | Button, Badge        |
| `outline`     | Border-only, no fill          | Button, Badge        |
| `ghost`       | Transparent, hover reveals bg | Button               |
| `link`        | Looks like a text link        | Button               |
| `success`     | Positive outcome              | Badge, Alert         |
| `warning`     | Needs attention               | Badge, Alert         |
| `info`        | Informational                 | Alert                |

### Naming Rules

- **`destructive`** is the canonical name for red/dangerous variants
- **`danger`** is an alias for `destructive` in components that support both (Button, Badge)
- Do NOT introduce `error` as a variant name -- use `destructive`
- **`success`** and **`warning`** are used in Badge and Alert but NOT in Button (buttons don't have success/warning semantics)
- **`info`** is only used in Alert

---

## Design Principles

1. **Monochrome first**: The palette is achromatic (gray scale). Color is used sparingly for status indication (success/warning/error) and data visualization (charts).

2. **Monospace identity**: JetBrains Mono gives the product a technical, developer-oriented aesthetic. All text, including headings, uses this font.

3. **Sharp by default**: With `--radius: 0`, components have square corners. This can be adjusted per-deployment by changing the `--radius` variable.

4. **Token-driven**: All visual properties flow from CSS custom properties. No hardcoded colors, fonts, or sizes in component implementations (except status colors like green/orange/red in Badge).

5. **Dark mode is a first-class citizen**: Every component must work in both light and dark themes via the token system.

---

_Plexica Design System v1.0_
_Source of truth: `packages/ui/src/styles/globals.css`_
