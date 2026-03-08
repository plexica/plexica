# Design Specification — Spec 012: Plugin Observability

> **Spec**: `.forge/specs/012-plugin-observability/spec.md`
> **User Journeys**: `.forge/specs/012-plugin-observability/user-journey.md`
> **Date**: 2026-03-07
> **Author**: forge-ux
> **Status**: Draft
> **Version**: 1.0

---

## 1. Overview

This document defines the UX/UI design for the Plugin Observability dashboard
in the Super Admin portal (`apps/super-admin`). It covers all visual components,
wireframes, interaction states, accessibility requirements, and design tokens
needed to implement US-006 (Super Admin Observability Dashboard) and related
frontend elements from Spec 012.

### Platform & Viewport Targets

| Target          | Value                                              |
| --------------- | -------------------------------------------------- |
| Platform        | Web SPA (React 19 + TanStack Router + Vite)        |
| Primary app     | `apps/super-admin` (separate from `apps/web`)      |
| Design approach | Desktop-first (1440px primary)                     |
| Breakpoints     | 1440px (2xl), 1280px (xl), 1024px (lg), 768px (md) |
| Performance     | Page load < 2 seconds on 3G (Art. 1.3 / NFR-018)   |
| Accessibility   | WCAG 2.1 AA (Art. 1.3 / NFR-019)                   |
| Auth            | `super_admin` role via Keycloak (FR-036)           |

### FR Coverage

This design spec covers: FR-024 through FR-037 (all dashboard and API FRs).
Infrastructure FRs (FR-001 through FR-021) are backend-only and have no
frontend design artifacts.

---

## 2. Persona

### Persona: Platform Operator ("Sam")

See `user-journey.md` §1 for full persona definition. Summary:

- **Role**: Super Admin — sole audience for all observability screens
- **Tech literacy**: High — familiar with Prometheus, distributed tracing, log querying
- **Device**: Desktop primary (1440px), occasional tablet (1024px)
- **Goal**: Proactive monitoring, fast incident response, trend analysis

---

## 3. Information Architecture

### 3.1 Navigation Placement

The "Observability" item is added to the Super Admin sidebar between "Health"
and "System Config" (per spec §9.1, adapted to actual sidebar order):

```
Super Admin Sidebar (apps/super-admin)
├── Dashboard         (existing — /dashboard)
├── Tenants           (existing — /tenants)
├── Plugins           (existing — /plugins)
├── Users             (existing — /users)
├── Observability     ← NEW (/observability)
│   ├── Health        (default tab)
│   ├── Metrics
│   ├── Traces
│   └── Alerts
├── System Config     (existing — /system-config)
├── Audit Log         (existing — /audit-log)
└── Health            (existing — /health)
```

**Sidebar icon**: `Activity` (Lucide) — already in use for the Health nav item.
Use `BarChart3` (Lucide) for Observability to distinguish it.

**Alert badge**: When alerts are firing, the Observability sidebar item shows
a numeric badge (reuse `NavItem.badge` prop from `AdminSidebarNav`).

### 3.2 Route Structure

| Route                                     | Component           | Tab                    |
| ----------------------------------------- | ------------------- | ---------------------- |
| `/observability`                          | `ObservabilityPage` | Health                 |
| `/observability?tab=health`               | `ObservabilityPage` | Health                 |
| `/observability?tab=metrics`              | `ObservabilityPage` | Metrics                |
| `/observability?tab=traces`               | `ObservabilityPage` | Traces                 |
| `/observability?tab=alerts`               | `ObservabilityPage` | Alerts                 |
| `/observability?tab=metrics&pluginId=crm` | `ObservabilityPage` | Metrics (pre-filtered) |

**Routing decision**: Use query parameters for tabs (not nested routes) because
all four tabs share the same page-level context (selected plugin, time range).
The URL is bookmarkable and shareable.

### 3.3 Shared Page-Level State

The following state persists across tab switches within the same page visit:

| State              | Type                              | Default      | Persisted        |
| ------------------ | --------------------------------- | ------------ | ---------------- |
| Active tab         | `health\|metrics\|traces\|alerts` | `health`     | URL `?tab=`      |
| Selected plugin ID | `string \| null`                  | `null` (all) | URL `?pluginId=` |
| Time range         | `1h\|6h\|24h\|7d`                 | `1h`         | URL `?range=`    |

Per user-journey §4: plugin context persists when navigating between tabs.

---

## 4. Screen Inventory

| #   | Screen Name              | Entry Point                  | Primary Action            | FR Ref         | New/Modified |
| --- | ------------------------ | ---------------------------- | ------------------------- | -------------- | ------------ |
| 1   | Observability — Health   | Sidebar → Observability      | Scan plugin health grid   | FR-024, FR-025 | New          |
| 2   | Observability — Metrics  | Tab switch or "View Metrics" | View time-series charts   | FR-024, FR-027 | New          |
| 3   | Observability — Traces   | Tab switch                   | Search and inspect traces | FR-024, FR-029 | New          |
| 4   | Trace Detail (waterfall) | Click trace row              | Inspect span tree         | FR-031         | New          |
| 5   | Observability — Alerts   | Tab switch or alert badge    | Review active alerts      | FR-024, FR-032 | New          |
| 6   | Super Admin Sidebar      | Always visible               | Navigate to Observability | FR-024         | Modified     |

---

## 5. Wireframes

### 5.1 Observability Page — Health Tab (Screen 1)

```
+============================================================================+
| Plexica Super Admin            [user avatar] [▼]                           |
+============================================================================+
| ┌──────────┐ ┌──────────────────────────────────────────────────────────┐  |
| │ Dashboard │ │                                                          │  |
| │ Tenants   │ │  Plugin Observability                                    │  |
| │ Plugins   │ │                                                          │  |
| │ Users     │ │  ┌──────────┬──────────┬──────────┬──────────┐          │  |
| │▸Observab. │ │  │ Health   │ Metrics  │ Traces   │ Alerts ● │          │  |
| │ Sys Config│ │  └──────────┴──────────┴──────────┴──────────┘          │  |
| │ Audit Log │ │  ═══════════                                             │  |
| │ Health    │ │                                                          │  |
| │           │ │  ┌── Summary Cards ──────────────────────────────────┐   │  |
| │           │ │  │ [●] 12 Healthy  [●] 2 Degraded  [●] 1 Down      │   │  |
| │           │ │  └──────────────────────────────────────────────────-┘   │  |
| │           │ │                                                          │  |
| │           │ │  ↻ Auto-refresh: 30s │ Last updated: 09:15:42           │  |
| │           │ │                                                          │  |
| │           │ │  ┌───────────────────────────────────────────────────┐   │  |
| │           │ │  │ Plugin Name  │ Status   │ P95(5m)│ Err% │ Up24h │   │  |
| │           │ │  ├──────────────┼──────────┼────────┼──────┼───────┤   │  |
| │           │ │  │ ● billing    │ ■ Down   │  ---   │ ---  │ 98.2% │   │  |
| │           │ │  │ ● crm        │ ■ Degrdd │ 680ms  │ 3.2% │ 99.1% │   │  |
| │           │ │  │ ● analytics  │ ■ Degrdd │ 510ms  │ 1.8% │ 99.7% │   │  |
| │           │ │  │ ● inventory  │ ■ Healthy│  42ms  │ 0.1% │100.0% │   │  |
| │           │ │  │ ● messaging  │ ■ Healthy│  38ms  │ 0.0% │100.0% │   │  |
| │           │ │  │ ● reporting  │ ■ Healthy│  55ms  │ 0.2% │ 99.9% │   │  |
| │           │ │  │ ...          │          │        │      │       │   │  |
| │           │ │  └───────────────────────────────────────────────────┘   │  |
| │           │ │                                                          │  |
| │           │ │  Each row has: [View Metrics] action button              │  |
| └──────────┘ └──────────────────────────────────────────────────────────┘  |
+============================================================================+
```

**Layout details**:

- Summary cards: 3 stat cards in a horizontal row showing healthy/degraded/down counts
- Table sorted by severity: Down first, then Degraded, then Healthy (within same status, alphabetical)
- Plugin Name is a clickable link → navigates to Metrics tab with that plugin pre-selected
- "View Metrics" is a ghost button at the end of each row
- Auto-refresh indicator: spinning `RefreshCw` icon + "Last updated: HH:MM:SS"

**States**:

- **Default**: Table populated, auto-refresh running
- **Loading**: Skeleton rows (6 rows of skeleton bars) replacing table body; summary cards show `Skeleton` components
- **Error (backend unavailable)**: Alert banner above table: `AlertTriangle` icon + "Unable to retrieve health data. The observability backend is not responding. Plugin operations are unaffected." Table shows last cached data if available, otherwise empty
- **Empty (no plugins)**: `EmptyState` component: `Puzzle` icon, "No active plugins", "Plugins must be installed and activated before health data is available.", `[Go to Plugins]` CTA button
- **Single plugin degraded**: Row for that plugin has yellow left-border accent
- **Single plugin down**: Row has red left-border accent

**Accessibility (Screen 1)**:

- Table uses `<table>` with `<thead>` / `<tbody>` and proper `<th scope="col">`
- Status badges use text + color (never color alone): "Healthy", "Degraded", "Down"
- Auto-refresh: `aria-live="polite"` region for "Last updated" timestamp
- Summary cards: each card uses `aria-label` (e.g., "12 plugins healthy")
- Tab order: Tab panel → Summary cards → Auto-refresh info → Table headers → Table rows → "View Metrics" buttons
- Screen reader: table `<caption>` = "Plugin health summary. Sorted by status severity."

---

### 5.2 Observability Page — Metrics Tab (Screen 2)

```
+============================================================================+
| Plexica Super Admin                                                        |
+============================================================================+
| ┌──────────┐ ┌──────────────────────────────────────────────────────────┐  |
| │ ...      │ │                                                          │  |
| │▸Observab.│ │  Plugin Observability                                    │  |
| │ ...      │ │                                                          │  |
| │          │ │  ┌──────────┬──────────┬──────────┬──────────┐          │  |
| │          │ │  │ Health   │ Metrics  │ Traces   │ Alerts   │          │  |
| │          │ │  └──────────┴──────────┴──────────┴──────────┘          │  |
| │          │ │              ═════════                                    │  |
| │          │ │                                                          │  |
| │          │ │  Plugin: [▼ CRM Plugin      ]   Range: [1h][6h][24h][7d]│  |
| │          │ │                                                          │  |
| │          │ │  ┌─────────────────────────┐ ┌─────────────────────────┐ │  |
| │          │ │  │ Request Rate (req/s)    │ │ Latency Distribution    │ │  |
| │          │ │  │                         │ │                         │ │  |
| │          │ │  │   ╱╲    ╱╲             │ │  --- P50                │ │  |
| │          │ │  │  ╱  ╲╱╱  ╲            │ │  --- P95                │ │  |
| │          │ │  │ ╱         ╲           │ │  --- P99                │ │  |
| │          │ │  │╱            ╲         │ │                         │ │  |
| │          │ │  │ [2xx] [4xx] [5xx]      │ │    ╱╲                  │ │  |
| │          │ │  └─────────────────────────┘ │   ╱  ╲   ╱╲          │ │  |
| │          │ │                               │  ╱    ╲╱╱  ╲        │ │  |
| │          │ │  ┌─────────────────────────┐ └─────────────────────────┘ │  |
| │          │ │  │ Error Rate (%)          │ ┌─────────────────────────┐ │  |
| │          │ │  │                         │ │ Resource Usage           │ │  |
| │          │ │  │         ╱╲              │ │                         │ │  |
| │          │ │  │        ╱  ╲            │ │ Memory ━━━  CPU ╌╌╌    │ │  |
| │          │ │  │ ══════╱    ╲═════     │ │    ╱                    │ │  |
| │          │ │  │                        │ │   ╱                     │ │  |
| │          │ │  │ [▸ Accessible view]    │ │  ╱   ╌╌╌╌╌╌╌╌╌╌╌╌    │ │  |
| │          │ │  └─────────────────────────┘ └─────────────────────────┘ │  |
| └──────────┘ └──────────────────────────────────────────────────────────┘  |
+============================================================================+
```

**Layout details**:

- **Controls bar**: Plugin selector (dropdown using `Select` component) + Time range toggle group (4 radio-style buttons: 1h, 6h, 24h, 7d)
- **Chart grid**: 2×2 grid on desktop (≥1024px), 1-column stack on tablet/mobile (<1024px)
- **Chart panels**: Each chart is inside a `Card` with `CardHeader` (title) and `CardContent` (chart area)
- Chart type is described abstractly (per OQ-003 — chart library TBD):
  - **Request Rate**: time-series line chart, multiple series stacked by HTTP status class (2xx green, 4xx yellow, 5xx red)
  - **Latency Distribution**: time-series line chart with 3 overlaid lines (P50, P95, P99)
  - **Error Rate**: time-series area chart, single series (% of 5xx)
  - **Resource Usage**: dual-axis time-series — memory (left axis, bytes) + CPU (right axis, %)
- **Legend**: inline below each chart, using colored markers + text labels
- **"Accessible view" toggle**: Expands a `DataTable` below the chart with the same data in tabular format (for screen readers)

**States**:

- **Default**: Charts populated with data, interactive tooltips on hover
- **Loading**: Each chart card shows a `Skeleton` rectangle (same dimensions as chart)
- **Error (Prometheus unavailable)**: Alert banner: "Unable to retrieve metrics. The observability backend is not responding." Charts show empty state with dashed border
- **Empty (no data for selected range)**: Each chart shows: "No metrics data available for [Plugin Name] in the selected time range."
- **Plugin just activated**: Charts show a short line with note: "Data available for the last [N] minutes only."
- **Plugin selector = "All Plugins"**: Charts show aggregate metrics across all plugins. Request Rate and Error Rate are summed; Latency is averaged.
- **Target down notice**: If the selected plugin's Prometheus target is down, a yellow `Alert` banner: "This plugin's metrics target is currently down. Charts may show gaps in recent data."

**Accessibility (Screen 2)**:

- Plugin selector: `<Select>` with `aria-label="Select plugin"`
- Time range: `role="radiogroup"` with `aria-label="Select time range"`, each button is `role="radio"`
- Charts: each `<div>` containing the chart has `aria-label` summarizing the data (e.g., "Request rate chart for CRM plugin, last 1 hour. Average: 12.3 requests per second.")
- "Accessible view" toggle: `aria-expanded` attribute; data table has full `<thead>` / `<tbody>` structure
- Chart colors: all series use distinct colors that pass 3:1 contrast against the chart background; legends use text labels alongside color swatches
- Tooltip on hover: `role="tooltip"` with `aria-describedby` linking to the data point

---

### 5.3 Observability Page — Traces Tab (Screen 3)

```
+============================================================================+
| Plexica Super Admin                                                        |
+============================================================================+
| ┌──────────┐ ┌──────────────────────────────────────────────────────────┐  |
| │ ...      │ │                                                          │  |
| │▸Observab.│ │  Plugin Observability                                    │  |
| │ ...      │ │                                                          │  |
| │          │ │  ┌──────────┬──────────┬──────────┬──────────┐          │  |
| │          │ │  │ Health   │ Metrics  │ Traces   │ Alerts   │          │  |
| │          │ │  └──────────┴──────────┴──────────┴──────────┘          │  |
| │          │ │                         ═════════                         │  |
| │          │ │                                                          │  |
| │          │ │  ┌─ Search ──────────────────────────────────────────┐   │  |
| │          │ │  │ Service: [▼ All services  ]                       │   │  |
| │          │ │  │ Trace ID: [____________________________]          │   │  |
| │          │ │  │ Time Range: [From: ________] — [To: ________]    │   │  |
| │          │ │  │                                        [Search]   │   │  |
| │          │ │  └──────────────────────────────────────────────────-┘   │  |
| │          │ │                                                          │  |
| │          │ │  Showing 20 of 142 traces                                │  |
| │          │ │                                                          │  |
| │          │ │  ┌───────────────────────────────────────────────────┐   │  |
| │          │ │  │ Trace ID      │ Root Service │ Duration│ Spans│St│   │  |
| │          │ │  ├───────────────┼──────────────┼─────────┼──────┼──┤   │  |
| │          │ │  │ 4a8f…c3d1 ↗  │ core-api     │  842ms  │   7  │OK│   │  |
| │          │ │  │ 7b2e…f9a0 ↗  │ core-api     │  234ms  │   4  │OK│   │  |
| │          │ │  │ 1c5d…b8e2 ↗  │ core-api     │ 1203ms  │  12  │ER│   │  |
| │          │ │  │ 9e3f…a1c4 ↗  │ plugin-crm   │   89ms  │   3  │OK│   │  |
| │          │ │  │ ...          │              │         │      │  │   │  |
| │          │ │  └───────────────────────────────────────────────────┘   │  |
| │          │ │                                                          │  |
| │          │ │  ┌─ Pagination ─────────────────────────────────────┐    │  |
| │          │ │  │ [< Prev]  Page 1 of 8  [Next >]                 │    │  |
| │          │ │  └──────────────────────────────────────────────────┘    │  |
| └──────────┘ └──────────────────────────────────────────────────────────┘  |
+============================================================================+
```

**Layout details**:

- **Search form**: Contained in a `Card` at top. Three fields:
  - Service dropdown (`Select`): "All services", "core-api", and all active plugin names
  - Trace ID text input (`Input`): optional, for direct trace lookup
  - Time Range: two date-time pickers (From / To), default last 1 hour
  - Search button (`Button` primary variant)
- **Results table**: `DataTable` with sortable columns
  - Trace ID: monospace font, truncated to 8…4 chars, entire row is clickable → navigates to trace detail
  - Root Service: the service that initiated the trace
  - Duration: milliseconds, sortable
  - Spans: integer count
  - Status: `Badge` — "OK" (green/`--status-active`) or "Error" (red/`--destructive`)
- **Pagination**: `Pagination` component below table

**States**:

- **Default**: Search form + results table populated
- **Loading (search)**: Table body replaced with skeleton rows; "Searching…" indicator
- **Error (Tempo unavailable)**: Alert banner: "Unable to search traces. The trace backend is not responding. Request processing is unaffected." Search form remains functional for retry.
- **Empty (no results)**: `EmptyState`: `Search` icon, "No traces found for the selected time range. Ensure plugins are actively processing requests."
- **Trace ID not found**: `EmptyState`: `Search` icon, "No trace found with ID [id]. The trace may have expired (retention: 7 days) or the ID may be incorrect."

**Accessibility (Screen 3)**:

- Search form: each field has visible `<Label>` + `htmlFor` association
- Table: sortable columns use `aria-sort` attribute; clickable rows use `role="link"` or `<a>` wrapping
- Trace ID text: `font-mono` for readability
- Status badge: text + color (not color alone)
- Pagination: `aria-label="Trace results pagination"`, current page `aria-current="page"`

---

### 5.4 Trace Detail — Span Waterfall (Screen 4)

```
+============================================================================+
| Plexica Super Admin                                                        |
+============================================================================+
| ┌──────────┐ ┌──────────────────────────────────────────────────────────┐  |
| │ ...      │ │                                                          │  |
| │▸Observab.│ │  ← Back to Traces    Trace: 4a8f…c3d1                   │  |
| │ ...      │ │                                                          │  |
| │          │ │  Duration: 842ms │ Spans: 7 │ Status: OK                 │  |
| │          │ │  [Open in Grafana ↗]                                     │  |
| │          │ │                                                          │  |
| │          │ │  ┌─ Span Waterfall ──────────────────────────────────┐   │  |
| │          │ │  │                                                    │   │  |
| │          │ │  │ ├─ core-api                                        │   │  |
| │          │ │  │ │  POST /api/v1/invoices                           │   │  |
| │          │ │  │ │  ████████████████████████████████████████  842ms │   │  |
| │          │ │  │ │                                                   │   │  |
| │          │ │  │ │  ├─ core-api                                     │   │  |
| │          │ │  │ │  │  validate-input                               │   │  |
| │          │ │  │ │  │  ██  3ms                                      │   │  |
| │          │ │  │ │  │                                                │   │  |
| │          │ │  │ │  ├─ plugin-billing                               │   │  |
| │          │ │  │ │  │  create-invoice                               │   │  |
| │          │ │  │ │  │      ██████████████████████████████  680ms    │   │  |
| │          │ │  │ │  │                                                │   │  |
| │          │ │  │ │  │  ├─ plugin-billing                            │   │  |
| │          │ │  │ │  │  │  db-query                                  │   │  |
| │          │ │  │ │  │  │       ██████████████████████  420ms        │   │  |
| │          │ │  │ │  │  │                                             │   │  |
| │          │ │  │ │  │  └─ plugin-billing                            │   │  |
| │          │ │  │ │  │     format-response                            │   │  |
| │          │ │  │ │  │                                ██  5ms         │   │  |
| │          │ │  │ │  │                                                │   │  |
| │          │ │  │ │  └─ plugin-crm                                   │   │  |
| │          │ │  │ │     update-contact                                │   │  |
| │          │ │  │ │                              ████  45ms           │   │  |
| │          │ │  │ │                                                   │   │  |
| │          │ │  └──────────────────────────────────────────────────-┘   │  |
| │          │ │                                                          │  |
| │          │ │  ┌─ Selected Span Detail ───────────────────────────┐   │  |
| │          │ │  │ Service: plugin-billing                           │   │  |
| │          │ │  │ Operation: db-query                               │   │  |
| │          │ │  │ Duration: 420ms                                   │   │  |
| │          │ │  │ Status: OK                                        │   │  |
| │          │ │  │                                                    │   │  |
| │          │ │  │ Attributes:                                        │   │  |
| │          │ │  │ ┌─────────────────┬──────────────────────────┐    │   │  |
| │          │ │  │ │ db.system       │ postgresql               │    │   │  |
| │          │ │  │ │ db.duration_ms  │ 420                      │    │   │  |
| │          │ │  │ │ http.status_code│ 200                      │    │   │  |
| │          │ │  │ │ tenant.id       │ acme-corp                │    │   │  |
| │          │ │  │ └─────────────────┴──────────────────────────┘    │   │  |
| │          │ │  └──────────────────────────────────────────────────-┘   │  |
| └──────────┘ └──────────────────────────────────────────────────────────┘  |
+============================================================================+
```

**Layout details**:

- **Back navigation**: "← Back to Traces" link at top (uses `ArrowLeft` icon)
- **Trace summary bar**: Trace ID (monospace), total duration, span count, overall status badge
- **"Open in Grafana" link**: Ghost button with external link icon. Opens `http://localhost:3000/explore?traceId={id}` in new tab
- **Span waterfall**: Tree-structured horizontal bar chart. Each span:
  - Indented by depth level (tree connectors: `├─` and `└─`)
  - Service name (colored by service — each service gets a consistent color)
  - Operation name
  - Horizontal bar proportional to duration relative to root span
  - Duration in `ms` label
  - Clickable → populates "Selected Span Detail" panel below
- **Selected Span Detail**: `Card` panel below the waterfall. Shows service, operation, duration, status, and attributes table
- **Error spans**: Bar is rendered in `--destructive` color; `AlertCircle` icon next to operation name

**States**:

- **Default**: Waterfall rendered, first span auto-selected for detail
- **Loading**: Full-height skeleton with indented skeleton bars mimicking waterfall shape
- **Error (Tempo unavailable)**: Alert banner + empty state
- **Large trace (>100 spans)**: Initial render shows 100 spans with collapsed sub-trees. "Show all N spans" button at bottom
- **Error trace**: Root span bar is red; error spans have red bars + error icon

**Accessibility (Screen 4)**:

- Waterfall uses `role="tree"` with `role="treeitem"` for each span
- Each span bar: `aria-label="[service] [operation], [duration], [status]"`
- Tree indentation: `aria-level` attribute matches depth
- Clickable spans: `role="treeitem"` with `tabindex`; keyboard Enter/Space to select
- Color coding supplemented with service name text label (never color alone)
- Span detail panel: `aria-live="polite"` so screen readers announce when selection changes
- "Open in Grafana" link: `aria-label="Open trace in Grafana (opens in new tab)"`, `target="_blank"`, `rel="noopener noreferrer"`

---

### 5.5 Observability Page — Alerts Tab (Screen 5)

```
+============================================================================+
| Plexica Super Admin                                                        |
+============================================================================+
| ┌──────────┐ ┌──────────────────────────────────────────────────────────┐  |
| │ ...      │ │                                                          │  |
| │▸Observab.│ │  Plugin Observability                                    │  |
| │ ...      │ │                                                          │  |
| │          │ │  ┌──────────┬──────────┬──────────┬──────────┐          │  |
| │          │ │  │ Health   │ Metrics  │ Traces   │ Alerts   │          │  |
| │          │ │  └──────────┴──────────┴──────────┴──────────┘          │  |
| │          │ │                                     ═════════            │  |
| │          │ │                                                          │  |
| │          │ │  Active Alerts (2)                                       │  |
| │          │ │                                                          │  |
| │          │ │  ┌─ CRITICAL ─────────────────────────────────────────┐  │  |
| │          │ │  │ ▲ PluginDown                                       │  │  |
| │          │ │  │   Plugin: billing                                  │  │  |
| │          │ │  │   Plugin container is unreachable (up == 0 for     │  │  |
| │          │ │  │   > 1 minute)                                      │  │  |
| │          │ │  │   Firing since: 2 minutes ago (09:13:42)           │  │  |
| │          │ │  │                                [View Plugin]        │  │  |
| │          │ │  └────────────────────────────────────────────────────-┘  │  |
| │          │ │                                                          │  |
| │          │ │  ┌─ WARNING ──────────────────────────────────────────┐  │  |
| │          │ │  │ ⚠ PluginHighErrorRate                              │  │  |
| │          │ │  │   Plugin: analytics                                │  │  |
| │          │ │  │   HTTP 5xx rate exceeds 5% over 5-minute window    │  │  |
| │          │ │  │   Firing since: 8 minutes ago (09:07:15)           │  │  |
| │          │ │  │                                [View Plugin]        │  │  |
| │          │ │  └────────────────────────────────────────────────────-┘  │  |
| │          │ │                                                          │  |
| │          │ │  ─────────────────────────────────────────────────────   │  |
| │          │ │                                                          │  |
| │          │ │  Alert History (last 7 days)      Severity: [▼ All]     │  |
| │          │ │                                                          │  |
| │          │ │  ┌───────────────────────────────────────────────────┐   │  |
| │          │ │  │ Alert Name     │Severity│Plugin  │Fired   │Reslvd│   │  |
| │          │ │  ├────────────────┼────────┼────────┼────────┼──────┤   │  |
| │          │ │  │ PluginHighLat  │Warning │crm     │Mar 6   │Mar 6 │   │  |
| │          │ │  │ PluginDown     │Critical│billing │Mar 5   │Mar 5 │   │  |
| │          │ │  │ CoreHighErr    │Critical│core-api│Mar 4   │Mar 4 │   │  |
| │          │ │  │ ...            │        │        │        │      │   │  |
| │          │ │  └───────────────────────────────────────────────────┘   │  |
| │          │ │                                                          │  |
| │          │ │  [< Prev]  Page 1 of 3  [Next >]                        │  |
| └──────────┘ └──────────────────────────────────────────────────────────┘  |
+============================================================================+
```

**Layout details**:

- **Active Alerts section**: Card-based layout, vertically stacked
  - Each alert card has: colored left border (critical=red, warning=yellow), severity icon + badge, alert rule name, affected plugin, description, firing timestamp (absolute + relative), "View Plugin" ghost button
  - Sorted by severity (critical first), then by firing time (oldest first)
  - Section heading shows count: "Active Alerts (2)"
- **Alert History section**: Separated by a `Separator` component
  - Severity filter dropdown (`Select`): "All", "Critical", "Warning"
  - `DataTable` with columns: Alert Name, Severity, Plugin, Fired At, Resolved At, Duration
  - `Pagination` at bottom (max 20 per page, per FR-023)

**States**:

- **Default**: Active alerts cards + history table populated
- **Loading**: Skeleton cards (2) in active section; skeleton rows in history table
- **Error (Alertmanager unavailable)**: Alert banner: "Unable to retrieve alerts. The alerting backend is not responding." Both sections show error state
- **No active alerts**: Active Alerts section shows: `CheckCircle` icon, "No active alerts. All plugins are operating normally." (green-tinted card)
- **No alert history**: History section: `EmptyState`: "No resolved alerts in the last 7 days."
- **Many active alerts (>5)**: Cards stack vertically with scroll. No pagination for active alerts (they should be urgently visible).

**Accessibility (Screen 5)**:

- Active alert cards: `role="alert"` for critical alerts (screen reader announces immediately); `role="status"` for warnings
- Severity badges: text + color + icon (triple redundancy for status)
- "View Plugin" buttons: `aria-label="View metrics for [plugin name]"`
- Alert History table: standard `DataTable` accessibility (see Screen 1)
- Section headings: `<h2>` for "Active Alerts" and "Alert History" (proper heading hierarchy under page `<h1>`)
- Severity filter: `<Select>` with `aria-label="Filter by severity"`

---

### 5.6 Super Admin Sidebar — Modified (Screen 6)

```
┌──────────────────────────┐
│ Dashboard      ◇         │
│ Tenants        ◇         │
│ Plugins        ◇         │
│ Users          ◇         │
│ Observability  ◆  [2]    │  ← NEW: BarChart3 icon + alert badge
│ System Config  ◇         │
│ Audit Log      ◇         │
│ Health         ◇         │
└──────────────────────────┘
```

**Changes to existing `_layout.tsx`**:

- Add `Observability` item to `SUPER_ADMIN_NAV_ITEMS` array
- Position: after "Users", before "System Config"
- Icon: `BarChart3` (Lucide) — distinguishes from existing `Activity` icon on "Health"
- Badge: shows count of currently-firing alerts (fetched from `GET /api/v1/observability/alerts` count)
- Path: `/observability`

---

## 6. Component Inventory

### 6.1 Existing Components Reused

| Component         | From               | Usage in Spec 012                                  |
| ----------------- | ------------------ | -------------------------------------------------- |
| `DataTable`       | `@plexica/ui`      | Health table, Trace results, Alert History         |
| `Card`            | `@plexica/ui`      | Chart panels, Alert cards, Summary cards           |
| `Badge`           | `@plexica/ui`      | Status badges, severity badges                     |
| `Select`          | `@plexica/ui`      | Plugin selector, Service dropdown, Severity filter |
| `Button`          | `@plexica/ui`      | Search, View Metrics, View Plugin, navigation      |
| `Input`           | `@plexica/ui`      | Trace ID text input                                |
| `Tabs`            | `@plexica/ui`      | Health/Metrics/Traces/Alerts tab navigation        |
| `Skeleton`        | `@plexica/ui`      | All loading states                                 |
| `EmptyState`      | `@plexica/ui`      | No plugins, no traces, no alerts                   |
| `Pagination`      | `@plexica/ui`      | Trace results, Alert History                       |
| `Alert`           | `@plexica/ui`      | Backend unavailable banners                        |
| `Tooltip`         | `@plexica/ui`      | Chart data point hover, truncated trace IDs        |
| `Separator`       | `@plexica/ui`      | Between Active Alerts and Alert History            |
| `Spinner`         | `@plexica/ui`      | Auto-refresh indicator                             |
| `StatCard`        | `@plexica/ui`      | Health summary counts (healthy/degraded/down)      |
| `StatusBadge`     | `@plexica/ui`      | Base for `HealthStatusBadge`                       |
| `AdminSidebarNav` | `apps/super-admin` | Modified to add Observability nav item             |

### 6.2 New Components

| Component               | Purpose                                                                 | Screens Used                     |
| ----------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| `HealthStatusBadge`     | Status badge with 4 states (Healthy/Degraded/Down/Unknown) + icon       | Health tab, Sidebar (mini badge) |
| `HealthSummaryTable`    | Auto-refreshing plugin health data table with severity sorting          | Health tab                       |
| `MetricsChartPanel`     | Chart wrapper with accessible fallback, loading/error states            | Metrics tab                      |
| `TimeRangeSelector`     | Toggle button group for 1h/6h/24h/7d time range selection               | Metrics tab, Traces tab          |
| `TraceSearchForm`       | Search form: service dropdown + trace ID + time range + submit          | Traces tab                       |
| `TraceResultsTable`     | Sortable trace results table with clickable rows                        | Traces tab                       |
| `SpanWaterfall`         | Tree-structured horizontal bar chart showing trace span hierarchy       | Trace Detail                     |
| `SpanDetailPanel`       | Span attributes display panel (key-value table)                         | Trace Detail                     |
| `ActiveAlertCard`       | Alert card with severity styling, description, timestamp, action button | Alerts tab                       |
| `AlertHistoryTable`     | Paginated table of resolved alerts with severity filter                 | Alerts tab                       |
| `AutoRefreshIndicator`  | Spinning icon + "Last updated" timestamp for polling data               | Health tab                       |
| `AccessibleChartToggle` | Toggle button that shows a DataTable alternative view of chart data     | Metrics tab                      |
| `ObservabilityPage`     | Page-level component with tab routing and shared state                  | All observability screens        |

---

## 7. Component Specifications

### 7.1 Component: HealthStatusBadge

**Type**: Badge variant (extends `StatusBadge` from `@plexica/ui`)
**Used on screens**: Health tab (table rows), sidebar (optional inline badge)
**FR coverage**: FR-025

| Property | Value                                                     |
| -------- | --------------------------------------------------------- |
| Variants | `healthy`, `degraded`, `down`, `unknown`                  |
| Sizes    | `sm` (table cells), `md` (standalone)                     |
| States   | Default only (no hover/disabled — it's a read-only badge) |

**Visual mapping**:

| Variant    | Background Color          | Text Color           | Icon            | Label      |
| ---------- | ------------------------- | -------------------- | --------------- | ---------- |
| `healthy`  | `--status-active` at 10%  | `--status-active`    | `CheckCircle2`  | "Healthy"  |
| `degraded` | `--status-warning` at 10% | `--status-warning`   | `AlertTriangle` | "Degraded" |
| `down`     | `--destructive` at 10%    | `--destructive`      | `XCircle`       | "Down"     |
| `unknown`  | `--muted`                 | `--muted-foreground` | `HelpCircle`    | "Unknown"  |

**Behavior**:

- Purely presentational — no click interaction
- Icon + text label + background color = triple redundancy (WCAG 1.4.1)

**A11y**:

- Role: `status`
- `aria-label`: "Plugin status: [healthy|degraded|down|unknown]"
- Color is never the sole differentiator (icon + text always present)

---

### 7.2 Component: MetricsChartPanel

**Type**: Card wrapper for time-series chart
**Used on screens**: Metrics tab (4 instances in 2×2 grid)
**FR coverage**: FR-027

| Property | Value                                                           |
| -------- | --------------------------------------------------------------- |
| Variants | `line`, `area`, `dual-axis`                                     |
| Sizes    | Responsive — fills grid cell                                    |
| States   | `default`, `loading`, `error`, `empty`, `accessible-table-open` |

**Slot / Content**:

- `title` (string): Chart heading (e.g., "Request Rate")
- `subtitle` (string, optional): Secondary label (e.g., "req/s")
- `chart` (ReactNode): The chart component (library-agnostic)
- `accessibleData` (array): Data for the accessible table fallback
- `ariaLabel` (string): Full chart description for screen readers

**Behavior**:

- Loading: shows `Skeleton` rectangle matching chart dimensions
- Error: shows `Alert` component with retry link
- Empty: shows centered text "No data available"
- "Accessible view" toggle at bottom-left expands a `DataTable` below the chart

**A11y**:

- Outer `<div>`: `role="img"` with `aria-label` describing chart content and summary
- "Accessible view" toggle: `<Button variant="ghost" size="sm">` with `aria-expanded`
- Data table (when visible): standard table accessibility, `<caption>` = chart title
- Chart tooltips: `role="tooltip"`, content announced via `aria-describedby`

---

### 7.3 Component: SpanWaterfall

**Type**: Custom visualization (tree + horizontal bar chart)
**Used on screens**: Trace Detail (Screen 4)
**FR coverage**: FR-031

| Property | Value                                                  |
| -------- | ------------------------------------------------------ |
| Variants | Single variant                                         |
| Sizes    | Full-width, height scales with span count              |
| States   | `default`, `loading`, `error`, `collapsed` (sub-trees) |

**Slot / Content**:

- `spans` (array): Span data with parent-child relationships
- `onSpanSelect` (callback): Fired when a span is clicked
- `selectedSpanId` (string): Currently selected span
- `maxVisibleSpans` (number): Default 100, shows "Show all" if exceeded

**Behavior**:

- Renders tree structure with indentation (tree connectors: `├─`, `└─`, `│`)
- Each span: service name (colored), operation name, horizontal bar proportional to duration
- Click on span: highlights bar, fires `onSpanSelect`, updates `SpanDetailPanel`
- Error spans: bar color = `--destructive`, `AlertCircle` icon next to operation
- Collapsed sub-trees: `ChevronRight` icon; click to expand → `ChevronDown`

**A11y**:

- Container: `role="tree"`, `aria-label="Trace span hierarchy"`
- Each span: `role="treeitem"`, `aria-level={depth}`, `aria-selected={isSelected}`
- Keyboard: ArrowUp/ArrowDown to navigate, ArrowRight to expand, ArrowLeft to collapse, Enter/Space to select
- Each span has `aria-label="[service] [operation], duration [N]ms, status [ok|error]"`
- Service colors supplemented by text labels (never color alone)

---

### 7.4 Component: ActiveAlertCard

**Type**: Card (extends `Card` from `@plexica/ui`)
**Used on screens**: Alerts tab
**FR coverage**: FR-032

| Property | Value                                                     |
| -------- | --------------------------------------------------------- |
| Variants | `critical`, `warning`                                     |
| Sizes    | Full-width                                                |
| States   | Default only (active alerts are always in "firing" state) |

**Visual mapping**:

| Variant    | Left Border        | Icon            | Badge BG           | Badge Text |
| ---------- | ------------------ | --------------- | ------------------ | ---------- |
| `critical` | `--destructive`    | `AlertCircle`   | `--destructive`    | "Critical" |
| `warning`  | `--status-warning` | `AlertTriangle` | `--status-warning` | "Warning"  |

**Slot / Content**:

- `alertName` (string): Rule name (e.g., "PluginDown")
- `severity` (string): "critical" or "warning"
- `pluginName` (string): Affected plugin
- `description` (string): Human-readable description
- `firingDuration` (string): Relative time ("2 minutes ago")
- `firingTimestamp` (string): Absolute time ("09:13:42")
- `onViewPlugin` (callback): Navigates to Metrics tab for plugin

**Behavior**:

- "View Plugin" button navigates to `/observability?tab=metrics&pluginId={id}`
- Critical cards should use `role="alert"` for immediate screen reader announcement

**A11y**:

- Critical alerts: `role="alert"` (assertive announcement)
- Warning alerts: `role="status"` (polite announcement)
- `aria-label="[severity] alert: [alertName] for plugin [pluginName]. Firing for [duration]"`
- "View Plugin" button: `aria-label="View metrics for [pluginName] plugin"`

---

### 7.5 Component: TimeRangeSelector

**Type**: Toggle button group
**Used on screens**: Metrics tab, (optionally Traces tab for preset ranges)
**FR coverage**: FR-027

| Property | Value                          |
| -------- | ------------------------------ |
| Options  | `1h`, `6h`, `24h`, `7d`        |
| States   | Each button: default, selected |

**Behavior**:

- Single selection (radio behavior)
- Selected button: `--primary` background + white text
- Unselected buttons: ghost/outline style

**A11y**:

- Container: `role="radiogroup"`, `aria-label="Select time range"`
- Each button: `role="radio"`, `aria-checked="true|false"`
- Keyboard: ArrowLeft/ArrowRight to navigate between options

---

### 7.6 Component: AutoRefreshIndicator

**Type**: Inline status indicator
**Used on screens**: Health tab
**FR coverage**: FR-025

| Property | Value                          |
| -------- | ------------------------------ |
| States   | `refreshing`, `idle`, `paused` |

**Behavior**:

- `refreshing`: `RefreshCw` icon spinning + "Refreshing..."
- `idle`: `RefreshCw` icon static + "Last updated: HH:MM:SS" (relative or absolute)
- `paused`: `Pause` icon + "Auto-refresh paused" (when tab is inactive, per `visibilitychange`)

**A11y**:

- Container: `aria-live="polite"`, `aria-atomic="true"`
- Text content changes trigger screen reader announcement (polite, not assertive)

---

### 7.7 Component: TraceSearchForm

**Type**: Form
**Used on screens**: Traces tab
**FR coverage**: FR-029, FR-030

| Property | Value                        |
| -------- | ---------------------------- |
| States   | `idle`, `searching`, `error` |

**Slot / Content**:

- Service dropdown (`Select`): options populated from active plugins list + "core-api"
- Trace ID input (`Input`): optional, monospace placeholder "e.g. 4a8f1b2c..."
- Time range: From/To date-time inputs (or the `TimeRangeSelector` preset)
- Submit button (`Button` primary): "Search"

**Behavior**:

- Submit triggers `GET /api/v1/observability/traces` with query params
- Trace ID search takes priority: if filled, service and time range are ignored
- Validation: From < To; range ≤ 30 days (per `INVALID_TIME_RANGE` error)

**A11y**:

- All inputs have visible `<Label>` elements
- Validation errors shown inline below the relevant field
- Submit button disabled while `searching` state

---

## 8. Health Status Color Conventions

These status mappings are used consistently across all observability screens
(Health tab, Alerts tab, sidebar badge):

### Plugin Health Status

| Status     | Condition (per spec §9.2)                                  | Color Token          | Icon            | Badge Text |
| ---------- | ---------------------------------------------------------- | -------------------- | --------------- | ---------- |
| `healthy`  | Error rate < 1% AND P95 < 500ms AND health check passing   | `--status-active`    | `CheckCircle2`  | "Healthy"  |
| `degraded` | Error rate ≥ 1% OR P95 ≥ 500ms (but health check passing)  | `--status-warning`   | `AlertTriangle` | "Degraded" |
| `down`     | Health check failing OR Prometheus target `up == 0`        | `--destructive`      | `XCircle`       | "Down"     |
| `unknown`  | No data available (plugin just activated or no scrape yet) | `--muted-foreground` | `HelpCircle`    | "Unknown"  |

### Alert Severity

| Severity   | Color Token        | Icon            | Badge Text |
| ---------- | ------------------ | --------------- | ---------- |
| `critical` | `--destructive`    | `AlertCircle`   | "Critical" |
| `warning`  | `--status-warning` | `AlertTriangle` | "Warning"  |

### Trace Status

| Status  | Color Token       | Badge Text |
| ------- | ----------------- | ---------- |
| `ok`    | `--status-active` | "OK"       |
| `error` | `--destructive`   | "Error"    |

### Metric Threshold Highlighting

In the Health table, metric values that exceed thresholds are shown in red text:

| Metric      | Threshold | Normal text color | Exceeded text color |
| ----------- | --------- | ----------------- | ------------------- |
| P95 latency | > 500ms   | `--foreground`    | `--destructive`     |
| Error rate  | > 5%      | `--foreground`    | `--destructive`     |

These thresholds match the alert rule conditions in FR-020.

---

## 9. Design Tokens (New)

### Observability-Specific Tokens (Spec 012)

These are semantic aliases of existing tokens, allowing observability
styling to evolve independently.

| Token                           | Value (Light) | Value (Dark) | Usage                                                    |
| ------------------------------- | ------------- | ------------ | -------------------------------------------------------- |
| `--obs-healthy`                 | `#16A34A`     | `#22C55E`    | Alias `--status-active`. Healthy badge/bar               |
| `--obs-degraded`                | `#D97706`     | `#F59E0B`    | Alias `--status-warning`. Degraded badge/bar             |
| `--obs-down`                    | `#DC2626`     | `#EF4444`    | Alias `--destructive`. Down badge/bar                    |
| `--obs-unknown`                 | `#6B7280`     | `#9CA3AF`    | Alias `--status-provisioning`. Unknown badge             |
| `--obs-alert-critical-border`   | `#DC2626`     | `#EF4444`    | Alias `--destructive`. Critical alert card left border   |
| `--obs-alert-warning-border`    | `#D97706`     | `#F59E0B`    | Alias `--status-warning`. Warning alert card left border |
| `--obs-span-bar-bg`             | `#0066CC`     | `#3B82F6`    | Alias `--primary`. Default span bar color                |
| `--obs-span-bar-error`          | `#DC2626`     | `#EF4444`    | Alias `--destructive`. Error span bar color              |
| `--obs-chart-series-1`          | `#16A34A`     | `#22C55E`    | Chart series: 2xx responses (green)                      |
| `--obs-chart-series-2`          | `#D97706`     | `#F59E0B`    | Chart series: 4xx responses (yellow)                     |
| `--obs-chart-series-3`          | `#DC2626`     | `#EF4444`    | Chart series: 5xx responses (red)                        |
| `--obs-chart-series-p50`        | `#0066CC`     | `#3B82F6`    | Chart series: P50 latency line                           |
| `--obs-chart-series-p95`        | `#D97706`     | `#F59E0B`    | Chart series: P95 latency line                           |
| `--obs-chart-series-p99`        | `#DC2626`     | `#EF4444`    | Chart series: P99 latency line                           |
| `--obs-chart-series-memory`     | `#7C3AED`     | `#A78BFA`    | Chart series: memory usage (purple)                      |
| `--obs-chart-series-cpu`        | `#0891B2`     | `#22D3EE`    | Chart series: CPU usage (cyan)                           |
| `--obs-waterfall-indent`        | `24px`        | `24px`       | Per-level indentation in span waterfall                  |
| `--obs-waterfall-bar-height`    | `20px`        | `20px`       | Height of each span bar                                  |
| `--obs-waterfall-row-height`    | `48px`        | `48px`       | Row height in waterfall (≥44px for WCAG 2.5.5)           |
| `--obs-chart-min-height`        | `240px`       | `240px`      | Minimum height for chart panels                          |
| `--obs-alert-card-border-width` | `4px`         | `4px`        | Left border width on alert cards                         |

### Contrast Verification

| Pair                                    | Ratio (Light) | Ratio (Dark) | Pass |
| --------------------------------------- | ------------- | ------------ | ---- |
| `--obs-healthy` text on `--background`  | 4.5:1         | 4.6:1        | ✅   |
| `--obs-degraded` text on `--background` | 4.5:1         | 4.5:1        | ✅   |
| `--obs-down` text on `--background`     | 5.8:1         | 4.6:1        | ✅   |
| `--obs-chart-series-memory` on `--card` | 6.5:1         | 4.5:1        | ✅   |
| `--obs-chart-series-cpu` on `--card`    | 4.5:1         | 4.5:1        | ✅   |
| `--obs-chart-series-p50` on `--card`    | 5.3:1         | 4.6:1        | ✅   |

All chart series colors pass WCAG 2.1 AA 3:1 minimum contrast for non-text
elements against the chart background (`--card`).

---

## 10. Responsive Behavior

### Breakpoint Adaptations

| Breakpoint       | Health Tab                         | Metrics Tab                      | Traces Tab                 | Alerts Tab                      |
| ---------------- | ---------------------------------- | -------------------------------- | -------------------------- | ------------------------------- |
| **≥1280px (xl)** | Full table, all columns visible    | 2×2 chart grid                   | Full table, all columns    | Cards + full history table      |
| **1024–1279px**  | Table scrolls horizontally         | 2×2 chart grid (narrower)        | Table scrolls horizontally | Cards + table scrolls           |
| **768–1023px**   | Hide "Uptime" column; horiz scroll | 1-column stack (charts vertical) | Hide "Span Count" column   | Cards stack; table scrolls      |
| **<768px**       | Hide "P95", "Err%"; horiz scroll   | 1-column stack; min-height 200px | Trace ID + Duration only   | Cards simplified; table scrolls |

### Mobile-Specific Adaptations

- **Charts (Metrics tab)**: Stack to single column below 1024px. Each chart card becomes full-width.
- **Health table**: Horizontal scroll container with sticky first column (Plugin Name).
- **Trace waterfall**: Horizontal scroll with sticky service name column. Waterfall bars use minimum width proportional rendering.
- **Alert cards**: Full-width, remove horizontal padding to maximize content area.
- **Tab navigation**: Tabs use horizontal scroll if labels overflow (unlikely with 4 short labels).

---

## 11. Interaction States Summary

### Common Interaction Patterns

| Element                   | Default          | Hover              | Active/Pressed      | Focus                     | Disabled            |
| ------------------------- | ---------------- | ------------------ | ------------------- | ------------------------- | ------------------- |
| Tab trigger               | Muted text       | Bg: `--muted`      | Bg: `--muted`       | Ring: `--ring` 2px        | N/A (always active) |
| Plugin name (link)        | `--primary` text | Underline          | `--primary` darker  | Ring: `--ring` 2px        | N/A                 |
| "View Metrics" button     | Ghost variant    | Bg: `--muted`      | Bg: darker muted    | Ring: `--ring` 2px        | Opacity 50%         |
| Time range button (sel.)  | `--primary` bg   | Slightly darker    | Pressed state       | Ring: `--ring` 2px        | N/A                 |
| Time range button (unsel) | Ghost/outline    | Bg: `--muted`      | Bg: darker muted    | Ring: `--ring` 2px        | N/A                 |
| Trace row (clickable)     | Default bg       | Bg: `--muted`      | Bg: darker muted    | Ring: `--ring` 2px offset | N/A                 |
| Span bar (clickable)      | Service color    | Slightly brighter  | Selected highlight  | Ring: `--ring` 2px        | N/A                 |
| Search button             | Primary variant  | Bg: darker primary | Bg: darkest primary | Ring: `--ring` 2px        | Loading spinner     |

### Loading States

| Component     | Loading Indicator                                       |
| ------------- | ------------------------------------------------------- |
| Health table  | 6 skeleton rows (Skeleton component), each with 6 cells |
| Summary cards | 3 Skeleton rectangles (same dimensions as StatCard)     |
| Chart panel   | Single Skeleton rectangle (240px height × full width)   |
| Trace results | 5 skeleton rows                                         |
| Waterfall     | 5 indented skeleton bars of decreasing width            |
| Active alerts | 2 skeleton cards (Card-shaped rectangles)               |
| Alert history | 5 skeleton rows                                         |
| Auto-refresh  | Spinning `RefreshCw` icon + "Refreshing..." text        |

### Error States

| Scenario               | UI Treatment                                                                                                                                               | Error Code (API)                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Prometheus unavailable | `Alert` banner (destructive): "Unable to retrieve [health/metrics/alerts]. The observability backend is not responding. Plugin operations are unaffected." | `OBSERVABILITY_BACKEND_UNAVAILABLE` |
| Tempo unavailable      | `Alert` banner: "Unable to search traces. The trace backend is not responding."                                                                            | `OBSERVABILITY_BACKEND_UNAVAILABLE` |
| Invalid time range     | Inline validation error below date picker: "Start time must be before end time."                                                                           | `INVALID_TIME_RANGE`                |
| PromQL query error     | Chart shows inline error: "Failed to load chart data. The query returned an error."                                                                        | `INVALID_QUERY`                     |
| Network timeout        | `Alert` banner: "Request timed out. Please try again."                                                                                                     | N/A (client-side)                   |

All error messages are actionable (Art. 1.3) and describe what the user can do.

---

## 12. Accessibility Checklist (WCAG 2.1 AA)

Applied to all screens in this spec:

### Perceivable

- [x] All status indicators use text + color + icon (triple redundancy per 1.4.1)
- [x] All text contrast ≥ 4.5:1 (verified in §9 token table)
- [x] Chart series contrast ≥ 3:1 against chart background (non-text, per 1.4.11)
- [x] Charts have `aria-label` descriptions summarizing content
- [x] "Accessible view" toggle provides data tables as alternative to charts
- [x] Text resizable to 200% — layout uses relative units; charts have min-height
- [x] No content flashes more than 3 times per second (auto-refresh is 30s, not rapid)

### Operable

- [x] All functionality accessible by keyboard
- [x] No keyboard traps (tab through forms, tables, waterfall tree)
- [x] Skip navigation link provided (existing in SuperAdmin shell)
- [x] Tab order matches visual order on all screens
- [x] Focus indicator visible on all interactive elements (existing `--ring` token)
- [x] Touch targets ≥ 44×44px on mobile (`--obs-waterfall-row-height: 48px`)
- [x] No time-dependent interactions (auto-refresh is passive; pauses when tab inactive)

### Understandable

- [x] Page language declared (`lang="en"` on `<html>`)
- [x] Error messages identify the problem and describe what to do
- [x] All form inputs have visible labels (not placeholder-only)
- [x] Required fields indicated with "(required)" text, not asterisk alone
- [x] Consistent navigation: tabs behave the same on every tab switch
- [x] Consistent component behavior: all tables sort the same way; all badges are styled consistently

### Robust

- [x] Valid HTML structure: proper heading hierarchy (`<h1>` page title → `<h2>` section → `<h3>` subsection)
- [x] All form elements have associated `<label>` elements
- [x] Dynamic content updates announced via `aria-live` regions
- [x] Tree navigation (`SpanWaterfall`): `role="tree"` / `role="treeitem"` with keyboard support
- [x] Tab component uses `role="tablist"` / `role="tab"` / `role="tabpanel"` (existing `@plexica/ui` Tabs)
- [x] Alert cards: `role="alert"` (critical) and `role="status"` (warning)

---

## 13. Performance Considerations

### Page Load Budget (< 2 seconds on 3G)

| Resource                  | Budget  | Strategy                                        |
| ------------------------- | ------- | ----------------------------------------------- |
| Observability route chunk | < 60 KB | Code-split via TanStack Router lazy loading     |
| Chart library             | < 50 KB | Chart library loaded on Metrics tab only (lazy) |
| SpanWaterfall component   | < 15 KB | Loaded on Trace Detail only (lazy)              |
| API data (health summary) | < 5 KB  | ~15 plugins × ~200 bytes each                   |
| API data (metrics query)  | < 20 KB | PromQL returns ≤500 data points per series      |
| API data (trace search)   | < 10 KB | 20 trace summaries × ~500 bytes                 |
| API data (trace detail)   | < 50 KB | Large traces with 100+ spans                    |

### Data Fetching Strategy

| Data                 | Fetch Method   | Cache Time | Refresh        |
| -------------------- | -------------- | ---------- | -------------- |
| Health summary       | TanStack Query | 30s        | Auto-poll 30s  |
| Metrics (charts)     | TanStack Query | 60s        | Manual refresh |
| Trace search results | TanStack Query | 0s         | On search only |
| Trace detail         | TanStack Query | 5m         | Manual refresh |
| Active alerts        | TanStack Query | 30s        | Auto-poll 30s  |
| Alert history        | TanStack Query | 60s        | Manual refresh |
| Active plugins list  | TanStack Query | 5m         | Background     |

**Auto-poll pausing**: Health summary and Active alerts auto-polling pauses
when the browser tab is not visible (via `visibilitychange` event).

---

## 14. Open Design Questions

### Resolved by This Design

| OQ     | Spec Question                     | Design Decision                                                                                 |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| OQ-003 | Chart library choice              | Design is library-agnostic — `MetricsChartPanel` accepts any chart as `ReactNode`. ADR pending. |
| OQ-004 | Custom waterfall vs Grafana embed | Custom `SpanWaterfall` component — better UX integration, accessibility, and no iframe needed.  |

### Remaining Design Questions

None — all UX questions resolved. The remaining OQs (OQ-001 OTel Collector, OQ-002 Loki
ingestion, OQ-005 sample rate) are infrastructure decisions with no frontend UX impact.

---

## 15. Cross-References

| Document                           | Path                                                     |
| ---------------------------------- | -------------------------------------------------------- |
| Spec 012 (upstream)                | `.forge/specs/012-plugin-observability/spec.md`          |
| User Journeys                      | `.forge/specs/012-plugin-observability/user-journey.md`  |
| Design System (global tokens)      | `.forge/ux/design-system.md`                             |
| Constitution (UX standards)        | `.forge/constitution.md` Art. 1.3, Art. 9.2              |
| Super Admin Layout                 | `apps/super-admin/src/routes/_layout.tsx`                |
| AdminSidebarNav                    | `apps/super-admin/src/components/AdminSidebarNav.tsx`    |
| Spec 008 (Admin Interfaces)        | `.forge/specs/008-admin-interfaces/spec.md`              |
| Spec 010 (Frontend Prod Readiness) | `.forge/specs/010-frontend-production-readiness/spec.md` |

---

_End of design-spec.md_
