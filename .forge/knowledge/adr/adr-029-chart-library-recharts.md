# ADR-029: recharts for Observability Dashboard Charts

> Architectural Decision Record documenting the selection of `recharts` as
> the React chart library for the Spec 012 Plugin Observability dashboard.
> Resolves Spec 012 Open Question OQ-003.

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Status   | Accepted                                           |
| Author   | forge-architect                                    |
| Date     | 2026-03-07                                         |
| Deciders | FORGE orchestrator, Spec 012 architecture planning |

---

## Context

Spec 012 (Plugin Observability) FR-027 requires time-series charts on the
Super Admin observability dashboard: request rate (line), latency
distribution (line with P50/P95/P99), error rate (area), and resource usage
(dual-axis line). The Metrics tab renders 4 chart panels in a 2×2 grid.

### Requirements

1. **React-native**: Must integrate cleanly with React 19.2 (Art. 2.1).
2. **TypeScript-typed**: Must have TypeScript type definitions (Art. 2.2 §3).
3. **WCAG 2.1 AA accessible**: Charts must support `aria-label`, focus
   management, and non-colour-only data differentiation (Art. 1.3).
4. **Time-series capable**: Must render line charts, area charts, and
   dual-axis charts with time-based X axis.
5. **Tree-shakeable**: Must support tree-shaking to minimise bundle size.
6. **>1000 weekly downloads**: Per Art. 2.2 §1 dependency policy.
7. **No known CVEs**: Per Art. 2.2 §2.

### Current State

- **Zero** chart libraries exist in any `package.json` across the monorepo.
- The frontend uses Tailwind CSS v4 (ADR-009) with design tokens — chart
  colours should reference Tailwind tokens for theme consistency.
- The observability dashboard is Super Admin only — it is not rendered on
  tenant-facing pages, so bundle impact is limited to the admin route chunk.

---

## Options Considered

### Option A: recharts (Chosen)

The most popular React chart library built on D3 and SVG.

- **Description**: Declarative React components (`<LineChart>`, `<AreaChart>`,
  `<ResponsiveContainer>`, `<Tooltip>`, `<Legend>`). SVG-based rendering.
  Built on `d3-scale`, `d3-shape`, `d3-interpolate`.
- **Pros**:
  - **Most popular**: ~3.5M weekly downloads, 24k+ GitHub stars
  - **React-native API**: Idiomatic JSX — `<LineChart data={data}><Line /><XAxis /></LineChart>`
  - **TypeScript support**: Full `@types/recharts` definitions (bundled since v2.12)
  - **Accessibility**: SVG `<title>` and `<desc>` elements support `aria-label`;
    `<Tooltip>` and `<Legend>` are keyboard-navigable
  - **Time-series**: Built-in `<XAxis type="number" domain={['dataMin', 'dataMax']} />` with
    custom tick formatters for time display
  - **Dual-axis**: `<YAxis yAxisId="left" />` + `<YAxis yAxisId="right" />` for resource usage
  - **Tree-shakeable**: Import only the components used — Vite eliminates unused code
  - **Responsive**: `<ResponsiveContainer>` auto-resizes to parent container
  - **Customisable**: Colours, stroke widths, fill patterns all configurable via props
  - **Stable API**: Major version (v2) has been stable since 2022; v3 is alpha
- **Cons**:
  - **Bundle size**: ~45 KB gzipped (including D3 dependencies). Heavier than uPlot (~8 KB).
    However, this is code-split into the admin route chunk and not loaded for regular users.
  - **SVG performance**: May degrade with >10k data points per chart. Mitigated by: Prometheus
    step size ensures <500 points per query for 7d range (7d / 15s steps = ~40k → use 5m steps
    for 7d range → 2016 points, manageable)
  - **D3 dependency tree**: Transitive D3 dependencies add to `node_modules` size (not
    production bundle size due to tree-shaking)
- **Effort**: Low (simple declarative API, extensive examples)

---

### Option B: @visx/xychart (Rejected)

Low-level React visualisation library from Airbnb, built on D3.

- **Description**: Composable React components for building custom charts.
  `@visx/xychart` provides high-level chart components while lower-level
  `@visx` packages offer primitives (scales, shapes, axes).
- **Pros**:
  - Smaller per-module size (~25 KB gzipped for xychart)
  - More flexible — can build non-standard visualisations
  - Fine-grained control over rendering
- **Cons**:
  - **More verbose**: Requires significantly more code for the same chart
  - **Steeper learning curve**: Lower-level API means more decisions
  - **Fewer examples**: Less community content for common patterns
  - **Accessibility**: Less built-in a11y support than recharts — requires
    manual ARIA attribute management
  - **Time-series gaps**: No built-in time axis formatting — requires custom
    tick components
  - **~560k weekly downloads**: Popular but less community momentum than recharts
- **Effort**: Medium-High (more code per chart)

**Rejected** because the additional flexibility is unnecessary for standard
time-series charts and the implementation cost is significantly higher.

---

### Option C: uPlot (Rejected)

Ultra-lightweight Canvas-based chart library.

- **Description**: Canvas-rendered charts optimised for large time-series
  datasets. ~8 KB gzipped. Not React-specific — requires a React wrapper.
- **Pros**:
  - **Smallest bundle**: ~8 KB gzipped — 5x smaller than recharts
  - **Fastest rendering**: Canvas-based, handles >100k data points
  - **Minimal dependencies**: Zero external dependencies
- **Cons**:
  - **Not React-idiomatic**: Imperative API requires a custom React wrapper
    with `useRef` + `useEffect` lifecycle management
  - **Poor accessibility**: Canvas-rendered charts have no DOM nodes for
    screen readers — requires a fully separate accessible data table fallback
  - **Limited chart types**: Line and area charts only — no built-in tooltip
    components, legends, or dual-axis support
  - **~70k weekly downloads**: Niche community
  - **TypeScript**: Types available but not bundled — `@types/uplot` is
    community-maintained
- **Effort**: High (custom React wrapper + accessibility layer)

**Rejected** because Canvas rendering makes WCAG 2.1 AA compliance
significantly harder (Art. 1.3), and the non-React API increases
implementation effort. The 37 KB bundle size savings is not justified when
the chart code is code-split into an admin-only route.

---

## Decision

**Use `recharts` ^2.15 as the chart library for the Spec 012 observability
dashboard.** Add as a dependency of `apps/web`.

### Package Details

| Package    | Version | Bundle (gzipped) | Weekly Downloads | TypeScript |
| ---------- | ------- | ---------------- | ---------------- | ---------- |
| `recharts` | ^2.15   | ~45 KB           | ~3.5M            | Bundled    |

### Bundle Impact

The observability dashboard is a **Super Admin route** (`/admin/observability/*`).
With Vite's route-based code splitting (via TanStack Router lazy routes),
recharts is loaded **only** when a Super Admin navigates to the observability
section. Regular tenant users never download this code.

Estimated chunk size: ~60 KB gzipped (recharts + chart components).

### Accessibility Strategy (Art. 1.3, WCAG 2.1 AA)

1. **SVG `<title>` and `<desc>`**: Each chart has an `aria-label` summarising
   the data (e.g., "Request rate for CRM plugin, last 1 hour: average 12.3 req/s").
2. **Non-colour differentiation**: Line styles (solid, dashed, dotted) +
   data point shapes (circle, square, triangle) supplement colour coding.
3. **Data table fallback**: An "Accessible view" toggle renders the chart
   data as an HTML `<table>` with proper `<thead>`, `<tbody>`, `<th scope>`,
   and `<caption>` for screen readers.
4. **Keyboard navigation**: `<Tooltip>` activates on focus (not just hover).
5. **Colour contrast**: Chart colours verified against 4.5:1 contrast ratio.

### Theme Integration

Chart colours reference Tailwind CSS design tokens via CSS custom properties:

```typescript
const CHART_COLORS = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  p50: 'var(--color-chart-p50)',
  p95: 'var(--color-chart-p95)',
  p99: 'var(--color-chart-p99)',
};
```

---

## Consequences

### Positive

- **Fast implementation**: Declarative API means 4 chart panels can be built
  in ~2 days (estimated 5 story points for T012-26).
- **Good accessibility baseline**: SVG rendering provides DOM nodes for ARIA
  attributes; `<Tooltip>` and `<Legend>` support keyboard interaction.
- **Community maturity**: Extensive Stack Overflow answers, blog posts, and
  example repositories for common patterns (time-series, dual-axis, responsive).
- **Consistent with React ecosystem**: recharts is the de facto standard
  React chart library — future developers will be familiar with it.

### Negative

- **Bundle size**: 45 KB gzipped is non-trivial. Mitigated by code-splitting
  into the admin route — zero impact on tenant user page loads.
- **SVG performance ceiling**: Charts may lag with >5000 data points. Mitigated
  by setting appropriate Prometheus `step` sizes (5m step for 7d range →
  ~2000 points).
- **D3 transitive dependencies**: Adds ~20 packages to `node_modules`. These
  are tree-shaken from production bundles but increase `pnpm install` time.

### Neutral

- recharts v3 is in alpha. v2 remains fully maintained. If v3 reaches GA
  during this project, migration is expected to be straightforward (API
  compatibility).

---

## Constitution Alignment

| Article                      | Alignment | Notes                                                                                                              |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| Art. 1.3 (UX Standards)      | ✅        | SVG-based charts support ARIA attributes; data table fallback for screen readers; non-colour differentiation.      |
| Art. 1.3 (Fast Page Loads)   | ✅        | Code-split into admin route — no impact on tenant page load time (<2s on 3G).                                      |
| Art. 2.1 (React ^19.2)       | ✅        | recharts ^2.15 is compatible with React 19.                                                                        |
| Art. 2.2 (Dependency Policy) | ✅        | This ADR IS the required approval. recharts has >3.5M weekly downloads, bundled TypeScript types, zero known CVEs. |

---

## Follow-Up Actions

- [ ] Add `recharts` ^2.15 to `apps/web/package.json` (T012-25)
- [ ] Create `MetricsCharts.tsx` component with 4 chart panels (T012-26)
- [ ] Implement data table fallback for accessibility (T012-26)
- [ ] Verify colour contrast ratios for chart colours (T012-33)
- [ ] Add axe-core accessibility tests for chart components (T012-34)

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- **ADR-009**: Tailwind CSS v4 design tokens — chart colours reference
  Tailwind CSS custom properties for theme consistency.
- **ADR-022**: axe-core for accessibility testing — chart components will
  be tested with axe-core for WCAG 2.1 AA compliance.
- **Spec 012 OQ-003**: This ADR resolves the Open Question.
- **Spec 012 FR-027**: Metrics tab time-series chart requirement.
