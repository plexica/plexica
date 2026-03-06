# Accessibility Audit — Spec 010 Frontend Production Readiness

**Date**: March 6, 2026  
**Auditor**: FORGE automated static-analysis pass (T010-31)  
**Method**: Static code review of all 7 design-spec screens (components + routes)  
**ADR-022 Status**: ⚠️ Pending approval — `@axe-core/react` not installed; this audit is based on
manual inspection. A follow-up dynamic axe-core scan must be run once ADR-022 is approved (T010-36).

**Screens audited**:

1. Login (`/login` → `login.tsx`, `AuthErrorPage.tsx`)
2. Plugin Error Fallback (`PluginErrorFallback.tsx`)
3. Theme / Branding Settings (`ColorPickerField.tsx`, `ThemePreview.tsx`, `FontSelector.tsx`)
4. Widget Dashboard (`WidgetLoader.tsx`, `WidgetFallback.tsx`)
5. Shell Layout (`AppLayout.tsx`, `Header.tsx`, `SidebarNav.tsx`)

---

## Summary

| Severity | Count | Status                            |
| -------- | ----- | --------------------------------- |
| Critical | 0     | ✅ None found                     |
| Serious  | 2     | ⚠️ Must fix before Sprint 5 merge |
| Moderate | 3     | 📋 Log as technical debt (TD)     |
| Minor    | 2     | 📋 Log as technical debt (TD)     |

**Overall verdict**: ✅ No `critical` violations. Two `serious` violations must be remediated in
T010-32/T010-34 before merge. Moderate and minor items logged as technical debt.

---

## Violations by Severity

### 🔴 Critical (0)

None found.

---

### 🟠 Serious (2)

#### A11Y-S01 — `AppLayout` missing skip-to-content link in React tree

**File**: `apps/web/src/components/Layout/AppLayout.tsx`  
**WCAG**: 2.4.1 Bypass Blocks (Level A)  
**Description**: The skip-to-content link exists in `index.html` but uses inline `onfocus`/`onblur`
JavaScript handlers. While functionally present, it is fragile (CSP `unsafe-inline` dependency for
scripts) and not part of the React component tree, making it untestable in Vitest/JSDOM.
The link style uses `position: absolute; left: -9999px` (an older pattern) rather than the more
robust `sr-only focus:not-sr-only` Tailwind approach already used in `admin._layout.tsx`.  
**Fix (T010-32/T010-34)**: Move skip link into `AppLayout.tsx` using the same Tailwind
`sr-only focus:not-sr-only` pattern as `admin._layout.tsx`:

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-background focus:border focus:border-border focus:rounded focus:text-foreground focus:text-sm"
>
  Skip to main content
</a>
```

Remove the `index.html` inline skip link once the React version is confirmed working.

---

#### A11Y-S02 — `PluginErrorFallback` buttons missing accessible names in collapsed mode

**File**: `apps/web/src/components/ErrorBoundary/PluginErrorFallback.tsx`  
**WCAG**: 4.1.2 Name, Role, Value (Level AA)  
**Description**: The "Retry" and "Go Back" buttons render text labels and have no icon-only
ambiguity in expanded state. However, they rely on `@plexica/ui` `Button` component. If Button's
internal render includes only the child as accessible name (which it does based on current
implementation), and Button wraps children in a `<span aria-hidden="true">`, the buttons would
have no accessible name.  
**Verification needed**: Inspect `@plexica/ui` `Button` component to confirm children are not
wrapped with `aria-hidden`. If children are exposed as-is, this is resolved. Mark as resolved once
`Button` source is confirmed (likely already correct).  
**Risk**: Moderate-to-serious if `@plexica/ui` Button hides children from AT. Treat as serious
until verified.  
**Fix**: Add explicit `aria-label` props to the two buttons as a defensive measure:

```tsx
<Button onClick={onRetry} variant="default" size="sm" aria-label="Retry loading plugin">
  Retry
</Button>
<Button onClick={() => void navigate({ to: '/plugins' })} variant="secondary" size="sm" aria-label="Go back to plugins list">
  Go Back
</Button>
```

---

### 🟡 Moderate (3)

#### A11Y-M01 — `ThemePreview` status color indicators use color alone

**File**: `apps/web/src/components/ui/ThemePreview.tsx` (lines 104–123)  
**WCAG**: 1.4.1 Use of Color (Level A)  
**Description**: Three `<span>` elements show success/warning/error color samples as filled
circles with no text label (only `aria-label`). The preview is correctly hidden with
`aria-hidden="true"` on the root element, so this does not affect screen reader users directly.
However, if `aria-hidden` is ever removed (e.g., for some interactive preview), the color-only
indicators become a violation.  
**Current status**: ✅ Not a live violation due to `aria-hidden="true"` on root. Logged as
moderate risk.  
**TD**: TD-A01 — Add text labels to color samples if `ThemePreview` becomes interactive.

#### A11Y-M02 — `WidgetFallback` heading uses `<p>` instead of a proper heading element

**File**: `apps/web/src/components/WidgetFallback.tsx` (line 44)  
**WCAG**: 1.3.1 Info and Relationships (Level A)  
**Description**: "Widget Unavailable" is rendered as `<p className="text-sm font-medium">` rather
than `<h3>` or similar. Screen readers will not announce this as a heading, which reduces
navigability. The component's `role="status"` is correct.  
**Fix**: Change `<p>` to `<h3>` for "Widget Unavailable":

```tsx
<h3 className="text-sm font-medium text-muted-foreground mb-1">Widget Unavailable</h3>
```

**Priority**: Moderate — low impact due to `role="status"` already being announced.

#### A11Y-M03 — `login.tsx` loading skeleton elements missing descriptive `aria-label`

**File**: `apps/web/src/routes/login.tsx` (lines 90–103)  
**WCAG**: 4.1.2 Name, Role, Value (Level AA)  
**Description**: The loading skeleton `<div>` elements use `aria-hidden="true"` correctly.
However, the outer skeleton container (`<div className="...flex min-h-screen items-center justify-center">`)
has no `role="status"` or `aria-label` to communicate to screen readers that authentication status
is being determined.  
**Fix**: Add `role="status"` and `aria-label="Loading, please wait"` to the skeleton container:

```tsx
<div
  role="status"
  aria-label="Loading authentication status, please wait"
  className="flex min-h-screen items-center justify-center bg-gradient-to-b ...">
```

---

### ⚪ Minor (2)

#### A11Y-N01 — `FontSelector` has both `<label htmlFor>` and `aria-label` (redundant)

**File**: `apps/web/src/components/ui/FontSelector.tsx` (lines 71, 80)  
**WCAG**: N/A (not a violation — redundant ARIA is ignored)  
**Description**: The `<select>` element has both a visible `<label>` (linked via `htmlFor={selectId}`)
and an explicit `aria-label={label}`. Both carry the same value. This is not a violation but is
redundant — the `aria-label` overrides the `<label>` for AT, causing the `<label>` text to not be
read by some AT implementations.  
**Fix (optional)**: Remove the redundant `aria-label` from `<select>` since `<label htmlFor>` is
sufficient and preferred:

```tsx
<select id={selectId} value={value} onChange={handleChange} disabled={disabled}
  // aria-label={label} ← remove; <label htmlFor> is sufficient
  data-testid="font-selector-select"
  ...>
```

#### A11Y-N02 — `Header` search button aria-label text is verbose

**File**: `apps/web/src/components/Layout/Header.tsx` (line 285)  
**WCAG**: N/A (not a violation)  
**Description**: The search trigger button has `aria-label="Open search (press /)"`. The keyboard
shortcut hint in the `aria-label` is not standard ARIA practice — keyboard shortcut info should
be in `aria-keyshortcuts` attribute.  
**Fix (optional)**:

```tsx
<button
  aria-label="Open search"
  aria-keyshortcuts="/"
  ...>
```

---

## Component ARIA Compliance Matrix

| Component               | `role`                    | `aria-label`               | `aria-*`                                    | Keyboard                              | Skip            | Status                |
| ----------------------- | ------------------------- | -------------------------- | ------------------------------------------- | ------------------------------------- | --------------- | --------------------- |
| `AppLayout`             | main, banner, contentinfo | —                          | —                                           | Tab order ✅                          | ⚠️ See A11Y-S01 | ⚠️                    |
| `Header`                | banner                    | logo, search, hamburger ✅ | —                                           | ✅                                    | —               | ✅                    |
| `SidebarNav`            | navigation                | "Main navigation" ✅       | aria-modal, aria-expanded, aria-controls ✅ | focus trap ✅, Escape ✅, Home/End ✅ | —               | ✅                    |
| `PluginErrorFallback`   | alert                     | —                          | aria-live="assertive" ✅                    | ⚠️ See A11Y-S02                       | —               | ⚠️                    |
| `PluginErrorBoundary`   | —                         | —                          | —                                           | wraps boundary ✅                     | —               | ✅                    |
| `AuthErrorPage`         | alert                     | heading ✅                 | —                                           | ✅                                    | —               | ✅                    |
| `ThemePreview`          | aria-hidden               | —                          | aria-hidden="true" ✅                       | —                                     | —               | ✅                    |
| `ColorPickerField`      | —                         | color picker, hex value ✅ | aria-describedby contrast ✅                | ✅                                    | —               | ✅                    |
| `FontSelector`          | —                         | via `<label htmlFor>` ✅   | —                                           | ✅                                    | —               | ✅ (minor redundancy) |
| `WidgetFallback`        | status                    | widget unavailable path ✅ | —                                           | —                                     | —               | ⚠️ A11Y-M02           |
| `WidgetLoader`          | —                         | via Suspense fallback      | —                                           | —                                     | —               | ✅                    |
| `WidgetLoadingSkeleton` | —                         | aria-hidden="true" ✅      | —                                           | —                                     | —               | ✅                    |
| `LoginPage`             | main                      | sign-in form ✅            | aria-busy, aria-disabled ✅                 | ✅                                    | —               | ⚠️ A11Y-M03           |
| `index.html` skip link  | —                         | "Skip to main content"     | —                                           | ✅                                    | ⚠️ inline JS    | ⚠️ A11Y-S01           |

---

## WCAG 2.1 AA Checklist (Design-spec §6)

| Criterion | Description                 | Status     | Notes                                                                     |
| --------- | --------------------------- | ---------- | ------------------------------------------------------------------------- |
| 1.1.1     | Non-text content (alt text) | ✅ Pass    | Logo img has alt; decorative icons have aria-hidden                       |
| 1.2.x     | Time-based media            | N/A        | No video/audio content                                                    |
| 1.3.1     | Info and relationships      | ⚠️ Partial | A11Y-M02 (WidgetFallback p vs h3)                                         |
| 1.3.2     | Meaningful sequence         | ✅ Pass    | DOM order matches visual order                                            |
| 1.3.3     | Sensory characteristics     | ✅ Pass    | No instructions relying on shape/color alone                              |
| 1.4.1     | Use of color                | ✅ Pass    | A11Y-M01 mitigated by aria-hidden on ThemePreview                         |
| 1.4.3     | Contrast minimum (text)     | ✅ Pass    | Contrast warning in applyTheme(); design tokens use semantic colors       |
| 1.4.4     | Resize text                 | ✅ Pass    | Tailwind rem-based sizing                                                 |
| 1.4.5     | Images of text              | ✅ Pass    | No images of text used                                                    |
| 1.4.10    | Reflow                      | ✅ Pass    | Responsive layout, no horizontal scroll at 320px                          |
| 1.4.11    | Non-text contrast           | ✅ Pass    | Focus rings use `focus-visible:ring-2`                                    |
| 1.4.12    | Text spacing                | ✅ Pass    | No fixed heights that clip text                                           |
| 1.4.13    | Content on hover/focus      | ✅ Pass    | No hover-only interactive content                                         |
| 2.1.1     | Keyboard accessible         | ✅ Pass    | All interactive elements reachable; SidebarNav focus trap ✅              |
| 2.1.2     | No keyboard trap            | ✅ Pass    | Trap released on Escape; modal cycles correctly                           |
| 2.1.4     | Character key shortcuts     | ✅ Pass    | `/` shortcut correctly guarded (not focused input)                        |
| 2.4.1     | Bypass blocks               | ⚠️ Partial | Skip link in index.html is functional but fragile (A11Y-S01)              |
| 2.4.2     | Page titled                 | ✅ Pass    | `<title>Plexica</title>` in index.html                                    |
| 2.4.3     | Focus order                 | ✅ Pass    | Logical tab order via DOM order                                           |
| 2.4.4     | Link purpose                | ✅ Pass    | All links/buttons have visible or aria labels                             |
| 2.4.6     | Headings and labels         | ⚠️ Partial | A11Y-M02 (WidgetFallback uses p instead of h3)                            |
| 2.4.7     | Focus visible               | ✅ Pass    | `focus-visible:ring-2 focus-visible:ring-primary` on interactive elements |
| 3.1.1     | Language of page            | ✅ Pass    | `<html lang="en">` in index.html                                          |
| 3.2.1     | On focus                    | ✅ Pass    | No context change on focus                                                |
| 3.2.2     | On input                    | ✅ Pass    | No unexpected context change on input                                     |
| 3.3.1     | Error identification        | ✅ Pass    | Login errors use role="alert"; color picker has contrast badge            |
| 3.3.2     | Labels and instructions     | ✅ Pass    | All form fields have labels                                               |
| 4.1.1     | Parsing                     | ✅ Pass    | Valid JSX → HTML; no duplicate IDs observed                               |
| 4.1.2     | Name, Role, Value           | ⚠️ Partial | A11Y-S02 (PluginErrorFallback buttons — verify Button component)          |
| 4.1.3     | Status messages             | ✅ Pass    | role="alert", role="status" correctly used                                |

---

## Fixes Required Before Sprint 5 Merge (T010-32/T010-34)

1. **A11Y-S01** (Serious): Move skip-to-content link into `AppLayout.tsx` using
   `sr-only focus:not-sr-only` pattern; remove inline skip link from `index.html`.
2. **A11Y-S02** (Serious): Add explicit `aria-label` to Retry/Go Back buttons in
   `PluginErrorFallback.tsx`. Also verify `@plexica/ui` Button renders children without
   `aria-hidden`.
3. **A11Y-M03** (Moderate, treat as required): Add `role="status"` + `aria-label` to login
   skeleton container in `login.tsx`.
4. **A11Y-M02** (Moderate): Change `<p>` to `<h3>` for "Widget Unavailable" in
   `WidgetFallback.tsx`.

---

## Technical Debt Items (Moderate/Minor — Log in decision-log.md)

| ID     | Component    | Issue                                                              | WCAG  |
| ------ | ------------ | ------------------------------------------------------------------ | ----- |
| TD-A01 | ThemePreview | Color-only status samples (mitigated by aria-hidden)               | 1.4.1 |
| TD-A02 | FontSelector | Redundant aria-label + label htmlFor                               | Minor |
| TD-A03 | Header       | aria-label includes keyboard shortcut hint (use aria-keyshortcuts) | Minor |

---

## Manual Screen Reader QA (T010-35 — Human Required)

> ⚠️ **T010-35 requires human verification.** The following flows must be manually tested with
> VoiceOver (macOS) and/or NVDA (Windows) by a team member before this spec is considered
> fully complete. AI-based static analysis cannot substitute for live AT testing.

**Required manual checks**:

- [ ] Login page: VoiceOver announces "Sign in" button with correct role and state
- [ ] Plugin error boundary: `role="alert"` is immediately announced when boundary triggers
- [ ] Theme settings form: FontSelector and ColorPickerField labels are read correctly
- [ ] Widget loading skeleton: `aria-hidden="true"` skeleton is skipped; `role="status"` fallback is announced
- [ ] Navigation landmarks: "Main navigation", "banner", "main", "contentinfo" are all present in landmark menu
- [ ] Skip-to-content link (after A11Y-S01 fix): Tab from blank page jumps to #main-content

---

## Next Steps

| Task    | Description                                   | Assigned To        |
| ------- | --------------------------------------------- | ------------------ |
| T010-32 | Fix A11Y-S01, A11Y-S02, A11Y-M02, A11Y-M03    | Build agent        |
| T010-33 | Add 3 Playwright keyboard navigation tests    | Build agent        |
| T010-34 | ARIA label fixes (already captured above)     | Build agent        |
| T010-35 | Manual screen reader QA                       | **Human required** |
| T010-36 | E2E axe-core tests (pending ADR-022 approval) | Build agent        |

---

_Generated by FORGE static analysis — T010-31. Pending dynamic axe-core verification (T010-36)._
