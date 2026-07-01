# Design Spec 004: Plugin System

> UX/UI design specification for Spec 004 — Plugin System.
> Created by forge-ux (manual) based on spec §9 and user-journey.md

| Field | Value |
| ----- | ----- |
| Spec | 004 — Plugin System |
| Status | Draft |
| Date | 2026-06-26 |
| Platform | Web SPA (React 19, Vite, Module Federation) |
| Viewport targets | Desktop 1440px primary, Tablet 768px secondary |
| Design system | `@plexica/ui` — Tailwind CSS + Radix UI + CSS Custom Properties |
| WCAG target | 2.1 AA |

---

## 1. Screens & Wireframes

### 1.1 Marketplace Screen (004-28)

**Route**: `/marketplace`
**Persona**: Alex Chen (Tenant Admin) — Journey 1
**FR ref**: 004-28

```
┌─────────────────────────────────────────────────────────────┐
│  Header: [logo]  [Workspace ▼]  [Marketplace]  [👤 Alex]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Marketplace                                    [🔍 Search]  │
│  ─────────────────────────────────────────────              │
│  [All] [Sales] [Productivity] [Analytics] [Dev Tools]       │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  📊 CRM  │  │  ⏱ Time │  │  📈 Ana- │  │  🛠️ Dev  │    │
│  │          │  │ Tracking │  │  lytics  │  │  Tools   │    │
│  │ Plexica  │  │ Acme Inc │  │ DataViz  │  │ CodeCraft│    │
│  │ ★★★★☆   │  │ ★★★☆☆   │  │ ★★★★★   │  │ ★★☆☆☆   │    │
│  │ 12 inst  │  │ 8 inst   │  │ 24 inst  │  │ 3 inst   │    │
│  │ [Sales]  │  │[Product] │  │[Analyt]  │  │[Dev]     │    │
│  │ [Install]│  │ [Install]│  │ [Install]│  │ [Install]│    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                              │
│                                           [Page 1 of 3 ▸]    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**States**:

| State | Behaviour |
|-------|-----------|
| **Default** | Grid of plugin cards with icon, name, description, categories, rating, install count, Install button |
| **Loading** | 6 skeleton cards (pulse animation, gray rounded rectangles mimicking card layout) |
| **Empty** | "No plugins available in the marketplace yet. Check back later." with empty illustration |
| **Error** | "Failed to load marketplace. [Retry]" with error icon and retry button |
| **Filtered** | Cards filtered by category or search query; real-time filtering as user types |

**Plugin Detail Sheet** (opens on card click):

```
┌─────────────────────────────────────────────────────────────┐
│  [× Close]                                      ┌────────┐ │
│  📊 CRM                                         │Install │ │
│  by Plexica                                     │   v1.0 │ │
│  ★★★★☆ (12 installs)                           └────────┘ │
│  ─────────────────────────────────────────────              │
│  Customer relationship management plugin.                   │
│  Manage contacts, deals, and pipelines directly             │
│  inside your Plexica workspace.                             │
│                                                              │
│  Categories: Sales, Productivity                             │
│  Permissions: crm:contact:read, crm:contact:create           │
│  Data tables: crm_contacts, crm_deals                        │
│  Events: subscribes to plexica.workspace.*                   │
│                                                              │
│  [✕ Cancel]                    [Install for this tenant]     │
└─────────────────────────────────────────────────────────────┘
```

**Install Progress** (after clicking Install):

```
┌─────────────────────────────────────────────────────────────┐
│  📊 CRM — Installing...                       [___________] │
│  ─────────────────────────────────────────────              │
│  ✅ Validating manifest                                     │
│  🔄 Pulling container image (45%)                           │
│  ⏳ Running migrations                                      │
│  ⏳ Starting container                                      │
│  ⏳ Creating consumer group                                 │
│                                                              │
│  This may take a few seconds. You can leave this page        │
│  — the plugin will be active once complete.                 │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Installed Plugins Screen (004-04, 004-05, 004-06)

**Route**: `/settings/plugins`
**Persona**: Alex Chen (Tenant Admin) — Journey 2
**FR ref**: 004-04, 004-05, 004-06

```
┌─────────────────────────────────────────────────────────────┐
│  Settings > Plugins                                         │
│  ─────────────────────────────────────────────              │
│                                                              │
│  Installed Plugins (3)                                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📊 CRM                        ● Active   [Deactivate]│   │
│  │ Customer relationship management plugin               │   │
│  │ Version 1.0.0 — Installed Apr 12                      │   │
│  │ [Workspace Visibility ▸] [Permissions ▸] [Uninstall] │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⏱ Time Tracking               ○ Deactivated [Activate]│   │
│  │ Track billable hours per workspace                    │   │
│  │ Version 1.0.0 — Installed Apr 10                      │   │
│  │ [Permissions ▸]                     [Uninstall]       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📈 Analytics                  ⚠ Unreachable [Retry]  │   │
│  │ Usage analytics dashboard                             │   │
│  │ Version 1.0.0 — Installed Apr 08                      │   │
│  │ [Workspace Visibility ▸] [Permissions ▸] [Uninstall] │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**States**:

| State | Behaviour |
|-------|-----------|
| **Default** | List of installed plugins with icon, name, description, version, install date |
| **Loading** | 3 skeleton list items (pulse) |
| **Empty** | "No plugins installed yet. Browse the Marketplace to find plugins for your workspace." |
| **Error** | "Failed to load installed plugins. [Retry]" |

**Status Badges**:

| Badge | Color | Meaning |
|-------|-------|---------|
| `● Active` | `--color-success-base` | Plugin running and visible to users |
| `○ Deactivated` | `--color-neutral-400` | Plugin installed but hidden from users |
| `⚠ Unreachable` | `--color-warning-base` | Plugin container unreachable; UI shows degraded state |
| `↑ Updating` | `--color-info-base` | Plugin update in progress |
| `✕ Failed` | `--color-error-base` | Install/update failed |

**Uninstall Confirmation Dialog** (on Uninstall click):

```
┌───────────────────────────────────────────────────────────────┐
│  ⚠ Uninstall CRM?                                            │
│  ─────────────────────────────────────────────                │
│                                                              │
│  This will permanently delete all CRM data:                  │
│    • crm_contacts — 1,247 contacts                           │
│    • crm_deals — 89 deals                                    │
│                                                              │
│  The plugin container will be stopped and Kafka consumer      │
│  group will be deleted. This action cannot be undone.        │
│                                                              │
│  [Cancel]                    [✕ Uninstall — delete all data] │
│                                      (destructive button)    │
└───────────────────────────────────────────────────────────────┘
```

**Workspace Visibility Editor** (on toggle):

```
┌───────────────────────────────────────────────────────────────┐
│  📊 CRM — Workspace Visibility                               │
│  ─────────────────────────────────────────────                │
│                                                              │
│  Tenant default: [Enabled ▼]  ← changes apply to new workspaces │
│                                                              │
│  Per-workspace overrides:                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Workspace              Status       Last modified      │  │
│  │ ─────────────────────────────────────────────────────  │  │
│  │ Engineering            ● Enabled    — (default)        │  │
│  │ Marketing              ● Enabled    — (default)        │  │
│  │ Accounting             ○ Disabled   Apr 14, 2026       │  │
│  │ Design                 ● Enabled    Apr 12, 2026       │  │
│  │ Sales                  ○ Disabled   Apr 10, 2026       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [Save changes]                                              │
└───────────────────────────────────────────────────────────────┘
```

### 1.3 Super Admin Plugin Registry (004-01)

**Route**: `/admin/plugins`
**Persona**: Sofia Rossi (Super Admin) — Journey 3
**FR ref**: 004-01

```
┌─────────────────────────────────────────────────────────────┐
│  Admin > Plugin Registry                                    │
│  ─────────────────────────────────────────────              │
│                                            [+ Register New] │
│  [🔍 Search plugins...]     [All ▼]  [Published ▼]          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📊 CRM       v1.0.0    ● Published     12 tenants   │   │
│  │ by Plexica        Plexica                           │   │
│  │ [View Versions]  [Unpublish]  [Edit Manifest]       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⏱ Time Tracking  v0.9.0   ○ Draft                  │   │
│  │ by Acme Inc       Plexica                            │   │
│  │ [View Versions]  [Publish]  [Edit Manifest]         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📈 Analytics     v2.1.0    ● Published     24 tenants│   │
│  │ by DataViz       Plexica                             │   │
│  │ [View Versions]  [Unpublish]  [Edit Manifest]       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│                                          [Page 1 of 2 ▸]    │
└─────────────────────────────────────────────────────────────┘
```

**Register New Plugin Dialog**:

```
┌───────────────────────────────────────────────────────────────┐
│  Register New Plugin                                          │
│  ─────────────────────────────────────────────                │
│                                                              │
│  Slug: [crm-plugin         ]  (lowercase, hyphens only)      │
│  Name: [CRM Plugin         ]                                  │
│  Registry URL: [docker.io/plexica/crm-plugin          ]      │
│  Image Tag: [1.0.0         ]                                  │
│  Registry Credentials: [optional ─────────────────]          │
│                                                              │
│  Manifest File: [📎 Upload manifest.json] or paste below     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ {                                                      │   │
│  │   "slug": "crm",                                       │   │
│  │   "name": "CRM",                                       │   │
│  │   "version": "1.0.0",                                  │   │
│  │   "hosting": { "type": "sidecar", ... }                │   │
│  │ }                                                      │   │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  [Cancel]                                [Register Plugin]   │
└───────────────────────────────────────────────────────────────┘
```

### 1.4 Super Admin DLQ Management (004-18)

**Route**: `/admin/system/dlq`
**Persona**: Sofia Rossi (Super Admin) — Journey 4
**FR ref**: 004-18

```
┌─────────────────────────────────────────────────────────────┐
│  Admin > System > Dead Letter Queue                         │
│  ─────────────────────────────────────────────              │
│                                                              │
│  Total: 34 failed events    [Retry All]  [Dismiss All]      │
│                                                              │
│  [All Status ▼]  [All Plugins ▼]  [Last 24h ▼]  [🔍Search] │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⚠ plexica.workspace.created      CRM Plugin  │ Retry │   │
│  │ Failed: 2m ago · 3 retries · "Container timeout" │ Dismiss│
│  │ [Inspect ▸]                                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⚠ plugin.crm.contact.created    CRM Plugin  │ Retry │   │
│  │ Failed: 15m ago · 2 retries · "DB connection refused"│ Dismiss│
│  │ [Inspect ▸]                                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ✕ plugin.crm.deal.closed        CRM Plugin  │ Retry │   │
│  │ Failed: 1h ago · 3 retries (DLQ) · "Timeout" │ Dismiss│
│  │ [Inspect ▸]                                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│                                          [Page 1 of 3 ▸]    │
└─────────────────────────────────────────────────────────────┘
```

**Inspect Event Detail**:

```
┌───────────────────────────────────────────────────────────────┐
│  Event Detail                                                 │
│  ─────────────────────────────────────────────                │
│                                                              │
│  Event Type:   plexica.workspace.created                     │
│  Plugin:       CRM Plugin (installId: abc-123)               │
│  Failed At:    2026-06-26 14:30:22 UTC                       │
│  Retry Count:  3 (exhausted — moved to DLQ)                  │
│  Status:       pending                                       │
│                                                              │
│  Error:                                                      │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ {                                                        │  │
│  │   "code": "ECONNREFUSED",                                │  │
│  │   "message": "Container at localhost:4002 refused        │  │
│  │               connection after 3 retries",               │  │
│  │   "attempts": [ "100ms", "500ms", "2s" ]                │  │
│  │ }                                                        │  │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Payload:                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ {                                                        │  │
│  │   "workspaceId": "ws-456",                               │  │
│  │   "name": "Engineering",                                 │  │
│  │   "tenantId": "tnt-789"                                  │  │
│  │ }                                                        │  │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  [Retry]                             [Dismiss]  [× Close]    │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Component Inventory

### 2.1 New Components

| Component | Screen | States | FR Ref |
|-----------|--------|--------|--------|
| **PluginCard** | Marketplace | default, hover, selected, disabled (already installed) | 004-28 |
| **PluginDetailSheet** | Marketplace | open/close, loading detail, error loading detail | 004-28 |
| **InstallButton** | Marketplace | default, installing (progress), installed, failed | 004-28 |
| **InstallProgress** | Marketplace | steps pending/in_progress/done/failed | 004-28 |
| **StatusBadge** | Installed Plugins | active, deactivated, unreachable, updating, failed | 004-04 |
| **PluginActions** | Installed Plugins | default, confirm (for destructive), loading | 004-04, 004-05 |
| **UninstallDialog** | Installed Plugins | default with data warning, confirming, deleting, error | 004-05 |
| **WorkspaceVisibilityEditor** | Installed Plugins | loaded, loading, saving, error | 004-06 |
| **PluginPermissionsSection** | Installed Plugins | loaded with role selectors, saving | 004-06 (DR-14) |
| **DlqEntryCard** | Admin DLQ | pending, retried, dismissed, expanded | 004-18 |
| **DlqInspectPanel** | Admin DLQ | open with event detail, retrying, dismissing | 004-18 |
| **PluginManifestEditor** | Admin Registry | viewing, editing, validating, saving, error | 004-01 |
| **ExtensionSlot** | Shell | empty (hidden), loaded, crashed (error boundary), loading | 004-08, 004-11, 004-12 |

### 2.2 Reused Components (from @plexica/ui)

| Component | Usage | Notes |
|-----------|-------|-------|
| **Dialog** | UninstallDialog, PluginDetailSheet, RegisterPluginDialog | Confirmation dialogs, detail modals |
| **Button** | InstallButton, PluginActions, RetryButton | Primary, secondary, destructive variants |
| **Input** | SearchBar, Manifest editor | Search with autocomplete |
| **Select** | Visibility toggle, role selector, DLQ filters | Workspace select, action role select |
| **Toggle** | Workspace visibility | Enable/disable plugin per workspace |
| **Badge** | StatusBadge (extends existing Badge) | New variants: active, deactivated, unreachable |
| **Table** | Installed plugins list (if table layout chosen) | With sortable columns |
| **Pagination** | Marketplace page, DLQ list | Standard pagination |
| **EmptyState** | Marketplace empty, installed plugins empty | Standard empty state pattern |
| **Skeleton** | Marketplace loading, installed plugins loading | Pulse skeleton cards/lists |
| **Toast** | Install success/failure, uninstall confirmation | System notifications |
| **ConfirmDialog** | UninstallDialog, Visibility changes | Warning variant with data loss alert |

### 2.3 Component States Matrix

| Component | Default | Hover | Active | Disabled | Loading | Error | Empty | Success |
|-----------|---------|-------|--------|----------|---------|-------|-------|---------|
| PluginCard | ✓ | ✓ | ✓ | ✓ (installed) | - | ✓ (load fail) | - | - |
| InstallButton | ✓ | ✓ | ✓ | ✓ (installed) | ✓ (progress) | ✓ (failed) | - | ✓ |
| StatusBadge | ✓ | - | - | - | - | - | - | - |
| UninstallDialog | ✓ | - | - | ✓ (processing) | ✓ (deleting) | ✓ | - | ✓ (done) |
| DlqEntryCard | ✓ | ✓ | - | - | ✓ (retrying) | - | - | ✓ (retried/dismissed) |
| DIalog (confirm) | ✓ | ✓ | ✓ | ✓ (processing) | ✓ (submitting) | ✓ | - | ✓ |
| SearchBar | ✓ | ✓ | ✓ | ✓ | - | - | ✓ (no results) | ✓ |

---

## 3. Accessibility (WCAG 2.1 AA)

### 3.1 Global Requirements

| Requirement | Standard | Verification |
|-------------|----------|-------------|
| Color contrast | 4.5:1 text, 3:1 large text (18px bold / 24px) | axe-core CI check |
| Keyboard navigation | All interactive elements reachable + operable via keyboard | Manual + axe-core |
| Focus indicator | 2px solid `--color-primary-500` outline, 2px offset | axe-core: `focus-visible` |
| ARIA labels | All icons, buttons, and interactive elements | Manual audit |
| Screen reader announcements | Dynamic content changes (install progress, errors) use `aria-live="polite"` | Manual verification |
| Error identification | Errors listed with `aria-describedby` linking input to error message | axe-core |
| Form labels | All form fields have `<label>` or `aria-label` | axe-core |
| Heading hierarchy | Single `<h1>` per page, logical h2-h6 nesting | axe-core |
| Landmarks | `<nav>`, `<main>`, `<aside>` for shell layout | Manual |

### 3.2 Screen-Specific A11y Requirements

| Screen | Focus Management | ARIA | Notes |
|--------|-----------------|------|-------|
| **Marketplace** | Focus moves to first result on search/filter | `role="grid"`, `aria-label="Plugin marketplace"` | Card navigation with arrow keys |
| **Plugin Detail Sheet** | Focus trapped inside sheet; focus returns to trigger on close | `role="dialog"`, `aria-modal="true"` | Escape key closes |
| **Install Progress** | `aria-live="polite"` on progress steps | `role="progressbar"`, `aria-valuenow` | Announce step changes |
| **Uninstall Dialog** | Focus on Cancel button (safe default); destructive button second | `role="alertdialog"` | Warning icon has `aria-hidden` |
| **Workspace Visibility** | Toggle switches keyboard-operable | `role="switch"`, `aria-checked` | Per-constitution: no window.confirm |
| **DLQ List** | Row keyboard navigation (up/down) | `role="list"`, individual `role="listitem"` | Expand/collapse with Enter/Space |
| **Extension Slots** | On plugin crash, focus moves to error boundary | `role="region"`, `aria-label="{plugin} slot"` | Retry button focus on error |

### 3.3 Plugin-Contributed UI Requirements

Plugin developers must ensure their MF components meet:

- WCAG 2.1 AA (enforced via axe-core in CI on the CRM example plugin)
- No custom focus management that breaks shell's tab order
- ARIA labels for all interactive elements (not just visual icons)
- Keyboard navigation for all custom controls
- Error boundaries include focus management (focus moves to error fallback)

---

## 4. Design Tokens

### 4.1 New Plugin-Specific Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--color-plugin-active` | `--color-success-base` (#22C55E) | Plugin active status badge |
| `--color-plugin-deactivated` | `--color-neutral-400` (#A3A3A3) | Plugin deactivated status badge |
| `--color-plugin-unreachable` | `--color-warning-base` (#F59E0B) | Plugin unreachable status badge |
| `--color-plugin-degraded` | `--color-warning-base` (#F59E0B) | Degraded state indicator |
| `--color-plugin-updating` | `--color-info-base` (#3B82F6) | Update in progress |
| `--color-plugin-failed` | `--color-error-base` (#EF4444) | Install/update failure |
| `--radius-plugin-card` | `--radius-lg` (8px) | Plugin card border radius |
| `--space-plugin-card-gap` | `--space-4` (16px) | Gap between plugin cards in grid |
| `--shadow-plugin-card` | `--shadow-md` | Plugin card shadow |
| `--animation-install-progress` | 300ms ease | Progress bar transition |
| `--z-plugin-slot-error` | 10 | Error boundary overlay z-index |

### 4.2 Reused Design System Tokens

All existing tokens from `@plexica/ui` apply:
- Typography: Inter font family, full size/weight scale
- Colors: neutral, primary, semantic (success/warning/error/info)
- Surface/Text modes: light + dark mode tokens
- Spacing: 4px base unit (space-0 through space-24)
- Border radius: sm through full
- Shadows: sm through xl

---

## 5. FR Traceability

| FR ID | Feature | Screen | Key Component(s) | AC Ref |
|-------|---------|--------|------------------|--------|
| 004-01 | Plugin registry CRUD | Admin Plugin Registry | PluginManifestEditor, plugin list | AC-01 |
| 004-02 | Manifest validation | Admin Plugin Registry | PluginManifestEditor validation errors | AC-01 |
| 004-03 | Plugin installation | Marketplace | InstallButton, InstallProgress | AC-01 |
| 004-04 | Plugin activation/deactivation | Installed Plugins | StatusBadge, PluginActions | AC-01 |
| 004-05 | Plugin uninstallation | Installed Plugins | UninstallDialog | AC-01 |
| 004-06 | Workspace visibility | Installed Plugins | WorkspaceVisibilityEditor | AC-03 |
| 004-07 | Vite Plugin Preset | (CLI, no UI) | — | AC-05 |
| 004-08 | Shell loads plugin remotes | Shell | ExtensionSlot | AC-04 |
| 004-09 | Shared dependencies | (infra, no UI) | — | NFR-02 |
| 004-10 | React context propagation | (infra, no UI) | — | AC-04 |
| 004-11 | Extension points | Shell | ExtensionSlot (sidebar, panel, widget) | AC-04 |
| 004-12 | Error boundary per slot | Shell | ExtensionSlot error state | EC-15 |
| 004-13 | Hot reload dev | (dev tool, no UI) | — | EC-15 |
| 004-14 | Core event emission | (infra, no UI) | — | EC-20 |
| 004-15 | SDK event subscription | (SDK, no UI) | — | AC-06 |
| 004-16 | Plugin custom events | (infra, no UI) | — | EC-24 |
| 004-17 | Consumer group management | (infra, no UI) | — | EC-22 |
| 004-18 | Dead letter queue | Admin DLQ | DlqEntryCard, DlqInspectPanel | AC-06 |
| 004-19 | Consumer lag monitoring | (metrics, no UI) | — | NFR-03 |
| 004-20 | API proxy | (infra, no UI) | — | AC-04 |
| 004-21 | Auth context headers | (infra, no UI) | — | EC-30 |
| 004-22 | Health check + circuit breaker | (infra, no UI) | — | EC-15 |
| 004-23 | CRM plugin MF UI | Shell (workspace-panel) | ExtensionSlot, ContactList, ContactForm | AC-04 |
| 004-24 | CRM plugin backend CRUD | (API, no direct UI) | — | AC-04 |
| 004-25 | CRM plugin data tables | (DB, no UI) | — | AC-07 |
| 004-26 | CRM plugin events | (infra, no UI) | — | AC-04 |
| 004-27 | CRM cross-workspace isolation | (infra, no UI) | — | AC-04 |
| 004-28 | Marketplace UI | Marketplace | PluginCard, PluginDetailSheet, InstallButton, SearchBar | AC-05 |
| 004-29 | CLI `create-plexica-plugin` | (CLI, no UI) | — | AC-05 |
| 004-30 | Plugin SDK + OpenAPI | (SDK, no UI) | — | AC-05 |

---

## 6. Summary

| Metric | Count |
|--------|-------|
| Screens wireframed | 4 (Marketplace, Installed Plugins, Admin Registry, DLQ Management) + 5 dialogs/sheets |
| New components | 13 |
| Reused components | 11 |
| New design tokens | 11 (all plugin-specific status colors) |
| Screens with full WCAG 2.1 AA | 4 (all wireframed screens) |
| FRs with UI components | 13 of 30 (17 are infra/CLI/SDK, no UI needed) |
| `[NEEDS CLARIFICATION]` | 0 |
