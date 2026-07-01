FORGE Dual-Model Code Review
=============================
Scope:   Unstaged changes — plugin marketplace frontend (6 files)
         rating-stars.tsx · plugin-card.tsx · plugin-detail-sheet.tsx
         messages.en.plugins.ts · marketplace-page.tsx · types/plugin.ts
Date:    2026-06-29
Models:  Task A — forge-reviewer
         Task B — forge-reviewer-peer
Dimensions: Correctness · Security · Performance · Maintainability ·
            Constitution · Test-Spec Coherence · UX Quality

Issues Found: 14 total (3 consensus · 7 A-only · 4 B-only)
─────────────────────────────────────────────────────────────────

[CONSENSUS][CRITICAL] TEST-SPEC COHERENCE — ALL MARKETPLACE FILES
  Issue: Zero E2E/integration test coverage for marketplace UI components.
  Spec AC-05 requires: "Given a tenant admin opens the marketplace, When
  they search for a plugin by name or category, Then matching published
  plugins are displayed with name, description, icon, rating, and install
  button." The existing E2E test (plugin-system.spec.ts) only verifies
  page renders — no coverage for: category filter chips, rating stars,
  detail sheet permissions/events/tables, install button, empty hint states.
  Impact: Violates Constitution Rule 1 ("Every feature has an E2E test").
  Merge blocker. No regression protection for any modified component.
  Suggestion: Add Playwright tests covering AC-05 full flow: filter by
  category, verify rating stars render, open detail sheet, verify
  permissions/events sections, verify install button. Add unit test for
  RatingStars (null, zero, half, full, edge values).
  Reported by: A + B

[CONSENSUS][HIGH] CORRECTNESS + UX — rating-stars.tsx:14-26
  Issue: Half-star rendering is both functionally broken and inaccessible.
  The component computes `hasHalf` correctly but renders a full `<Star>`
  icon with only a color change (`text-amber-300` vs `text-amber-400`).
  The star is fully filled — users see a full star, not a half star.
  Users with color vision deficiencies cannot distinguish the shade
  difference (WCAG 1.4.1 — Use of Color). A rating of 3.5 is visually
  indistinguishable from 4.0.
  Impact: Rating display is misleading. Users cannot accurately judge
  plugin ratings. WCAG 1.4.1 violation. Spec 004-28 ("rating stars")
  is not correctly implemented.
  Suggestion: Implement proper half-star rendering via:
  1. SVG clipPath showing half-filled star, or
  2. Linear-gradient background-clip: text approach, or
  3. Two overlapping half-star elements with overflow: hidden
  At minimum, round to nearest integer if half-star is infeasible,
  and document the limitation.
  Reported by: A + B

[CONSENSUS][MEDIUM] UX QUALITY — marketplace-page.tsx:136-146
  Issue: Empty state hint "Try adjusting your search or clearing the
  category filter" is shown unconditionally, even when no search or
  filter is active. When the marketplace is genuinely empty, this
  misleadingly implies plugins exist but aren't matching the query.
  Impact: User confusion — may keep adjusting filters fruitlessly
  when no plugins exist. Undermines trust in the UI.
  Suggestion: Conditionally render the hint only when a filter is
  active (`debouncedSearch.length > 0 || selectedCategory.length > 0`).
  Create separate empty state strings: `marketplace.empty.global` for
  truly empty marketplace, `marketplace.empty.filtered` for no-match.
  Reported by: A + B

─────────────────────────────────────────────────────────────────

[A][HIGH] UX:ACCESSIBILITY — plugin-card.tsx:42-48
  Issue: Plugin card `<div>` has `onClick` but no `tabIndex` or
  `onKeyDown` handler. Role="article" does not imply interactive
  semantics. Keyboard users cannot tab to the card or activate it
  with Enter/Space.
  Impact: WCAG 2.1.1 Keyboard violation. Keyboard-only and screen
  reader users cannot open the detail sheet — blocks core marketplace
  interaction for assistive technology users.
  Suggestion: Add `tabIndex={0}` and `onKeyDown` handler for
  Enter/Space keys. Alternatively, wrap in a `<button>` element.

[A][HIGH] CORRECTNESS — plugin-detail-sheet.tsx:129
  Issue: Error state shows indefinite loading skeleton. Condition
  `isPending || plugin === undefined` conflates loading and error
  states. When API returns error, sheet shows permanent spinner.
  Impact: Network error or 500 causes forever-loading skeleton with
  no retry or error message. User can only close the sheet.
  Suggestion: Add error state branch with retry button. Check
  `isPending` first, then `isError`, then content. Pass `isError`
  from hook.

[A][MEDIUM] CORRECTNESS — plugin-card.tsx:17-26
  Issue: `e2e` and `testing` category keys both map to
  `marketplace.categories.all` which displays "All" — almost certainly
  a copy-paste error. No i18n keys for these categories exist, and
  the CATEGORIES array in marketplace-page.tsx doesn't include them.
  Impact: Plugins tagged with `e2e` or `testing` show a misleading
  "All" badge. Users cannot identify the plugin's actual category.
  Suggestion: Add proper i18n keys for these categories and include
  them in the CATEGORIES array, or remove the mappings and rely on
  raw category fallback display.

[A][MEDIUM] UX:ACCESSIBILITY — MULTIPLE FILES
  Issue: Hardcoded `text-[10px]` and `text-[11px]` pixel values in
  rating-stars.tsx:18, plugin-card.tsx:71, plugin-detail-sheet.tsx:41/54/66.
  WCAG 1.4.4 (Resize Text) requires text resizable up to 200%. Pixel-
  locked sizes may not scale with browser "Zoom text only" setting.
  Impact: Users relying on text zoom may find badges, labels, and
  code blocks illegible at 10px.
  Suggestion: Replace with Tailwind's rem-based type scale
  (e.g., `text-xs` = 0.75rem, or a `text-2xs` design token).

[A][MEDIUM] PERFORMANCE — marketplace-page.tsx:45-49
  Issue: `queryParams` object created fresh on every render. TanStack
  Query's structural equality mitigates refetch storms, but the
  `queryFn` closure captures a new object each time, creating garbage
  on every render cycle.
  Impact: Minor — unnecessary allocations compound with fast typing
  during search (300ms debounce triggers many renders).
  Suggestion: Memoize with `useMemo` keyed on
  `[page, debouncedSearch, selectedCategory]`.

[A][MEDIUM] CORRECTNESS — marketplace-page.tsx:51-53
  Issue: `usePluginDetail(detailSlug)` fires as soon as `selectedSlug`
  is set, BEFORE the detail sheet opens. Rapid card clicking (scanning)
  fires multiple parallel API calls — only the last is presented.
  Impact: Wasted bandwidth and backend load. On slow networks, several
  requests may be in-flight simultaneously.
  Suggestion: Add abort controller, debounce slug setter (~150ms), or
  include sufficient detail in the list response to eliminate the
  separate detail endpoint call.

[A][LOW] UX:ACCESSIBILITY — plugin-detail-sheet.tsx:127
  Issue: Dialog uses `aria-label` with static "Plugin Details" string
  instead of `aria-labelledby` pointing to the dynamic `<h2>` heading
  showing the actual plugin name.
  Impact: Screen reader announces "Plugin Details" for every plugin
  rather than the specific plugin name. WCAG 4.1.2 practical failure.
  Suggestion: Add id to `<h2>` and use `aria-labelledby` on the dialog.

[A][LOW] UX QUALITY — plugin-detail-sheet.tsx:187
  Issue: After successful install, button changes to "Installed" but
  no toast or visual confirmation. User Journey 3 step 8 explicitly
  requires "Installation complete → success toast."
  Impact: Users may not notice the subtle button state change and
  wonder if installation succeeded.
  Suggestion: Add toast notification on install success via
  mutation's `onSuccess` callback.

─────────────────────────────────────────────────────────────────

[B][HIGH] CONSTITUTION + UX — plugin-detail-sheet.tsx:157-159
  Issue: Category labels rendered as raw IDs (e.g., "communication")
  instead of localized strings via CATEGORY_LABEL_MAP. Meanwhile
  plugin-card.tsx correctly uses `<FormattedMessage>`. Inconsistent.
  Impact: Users see raw IDs like "dev-tools" in detail sheet but
  "Dev Tools" in the card. Non-English users see untranslated IDs.
  Violates Constitution Rule 3 (one pattern — all UI strings via
  react-intl).
  Suggestion: Extract CATEGORY_LABEL_MAP to shared constants file
  and use `<FormattedMessage>` with it in detail sheet as well.

[B][MEDIUM] CORRECTNESS — plugin-detail-sheet.tsx:103-108
  Issue: `requestAnimationFrame` callback scheduled for focus
  management is never cancelled in the cleanup function. Rapid
  open/close cycles leave stale rAF callbacks that may fire after
  component returns null.
  Impact: In edge cases (React Strict Mode, rapid navigation), focus
  jumps to now-unmounted elements. Fragile pattern — React docs warn
  against uncancelled rAF in effects.
  Suggestion: Store rAF ID in a ref and call `cancelAnimationFrame()`
  in the cleanup function.

[B][MEDIUM] UX:ACCESSIBILITY — marketplace-page.tsx:98
  Issue: Category filter `<div role="group">` uses
  `aria-label={intl.formatMessage({ id: 'marketplace.categories.all' })}`
  which resolves to "All" — not a meaningful group description.
  Screen reader announces "All, group" with no context.
  Impact: WCAG 4.1.2 — inaccessible group label. Users don't know
  this is a filter bar.
  Suggestion: Use a dedicated i18n key like
  `'marketplace.categories.filterLabel': 'Filter by category'`.

[B][MEDIUM] UX:DEFENSIVE — plugin-detail-sheet.tsx:148
  Issue: Close button has no `type="button"` attribute. Default type
  for `<button>` is `"submit"` when inside a form. Future refactoring
  that adds form elements would cause unexpected form submission.
  Impact: Future bug waiting to happen — hard to debug because the
  failure appears unrelated to the change.
  Suggestion: Add `type="button"` to all non-submit buttons.

[B][LOW] MAINTAINABILITY — plugin-detail-sheet.tsx:196
  Issue: File at exactly 196 lines — dangerously close to 200-line
  limit (Constitution Rule 4). Any additional feature would breach.
  Impact: Next developer must either refactor mid-sprint or violate
  constitution. Sub-components (InfoSection, PermissionsSummary,
  DataTablesSummary, EventsSummary) are good candidates for extraction.
  Suggestion: Proactively extract helper sub-components to a separate
  file before the limit is hit.

[B][LOW] MAINTAINABILITY — i18n/messages.en.plugins.ts
  Issue: `marketplace.close` i18n key is placed at the end of the
  file (after DLQ keys), far from other `marketplace.*` keys.
  Impact: Reduces maintainability — developers expect keys grouped.
  Increases chance of key duplication.
  Suggestion: Move `'marketplace.close'` to the marketplace section.

─────────────────────────────────────────────────────────────────

Summary:
  CONSENSUS:  3  (highest confidence — CRITICAL, HIGH, MEDIUM)
  A only:     7
  B only:     4
  Severity:  CRITICAL 1 | HIGH 4 | WARNING 6 | INFO 3

Verdict: NEEDS CHANGES — BLOCKING

─────────────────────────────────────────────────────────────────

### Blocker: Constitution Rule 1 Violation

The CRITICAL consensus finding (zero E2E test coverage for marketplace UI)
is a **merge blocker** per Constitution Rule 1. The spec AC-05 acceptance
criteria cannot be verified without automated tests.

### Required Before Merge

1. **[CRITICAL] Add E2E tests** for AC-05 marketplace flow: category filters,
   rating stars, detail sheet (permissions/events/tables sections), install button
2. **[HIGH] Fix half-star rendering** in RatingStars — visually broken + WCAG 1.4.1
3. **[HIGH] Add keyboard accessibility** to PluginCard (tabIndex + onKeyDown)
4. **[HIGH] Fix detail sheet error state** — don't show permanent loading skeleton on API error
5. **[HIGH] Fix category i18n** in detail sheet — use CATEGORY_LABEL_MAP + FormattedMessage

### Strongly Recommended Before Merge

6. Fix `e2e`/`testing` category mapping (misleading "All" label)
7. Conditionally render empty state hint only when filter is active
8. Cancel rAF on cleanup in detail sheet effect
9. Fix category filter group aria-label
10. Add `type="button"` to close button

### Follow-Up Items

11. Replace `text-[10px]` with rem-based sizes (WCAG 1.4.4)
12. Memoize queryParams in marketplace-page
13. Address detail sheet pre-fetch waste
14. Use aria-labelledby on dialog for dynamic plugin name
15. Add install success toast
16. Extract sub-components from plugin-detail-sheet (near 200-line limit)
17. Reorganize i18n key placement

─────────────────────────────────────────────────────────────────

**Human review is the second gate.** These findings should be verified
and prioritized by a human reviewer before merge. The CRITICAL consensus
finding (missing E2E tests) is a hard blocker per Constitution Rule 1.
