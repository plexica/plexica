# User Journeys — 004 Plugin System

> Traceable to Spec 004. Personas derived from US-001 through US-005.  
> **Data-heavy features**: Marketplace browsing, DLQ inspection, installed plugins list.

---

## Persona 1: Marco — Platform Operator (Super Admin)

**Role**: Platform Administrator at Plexica  
**Goal**: Curate a healthy plugin ecosystem; ensure plugin quality and platform stability before tenants see anything  
**Pain points**:  
- No visibility into failing plugin event handlers (blind to production issues)  
- Manual plugin registration process with error-prone manifest editing  
- Cannot quickly retry failed events when plugin bugs are fixed  

**Tech literacy**: High (Infra/SRE background, comfortable with Docker, Kafka, DBs)  
**Device preference**: Desktop (primary, admin work), Mobile (alert triage, rare)  
**Accessibility needs**: None  
**Quote**: *"I need to ship plugins fast and clean up messes faster."*

### Journey 1: Marco — Register & Publish a New Plugin (Happy Path)

**Trigger**: Third-party developer submits a new CRM plugin container image + manifest.

**Steps**:
1. Opens **Super Admin Panel** → navigates to **Plugins** in left sidebar
2. Clicks **"Register Plugin"** → form appears (slug, registry URL, image details, manifest upload)
3. Pastes registry URL and image tag, uploads `manifest.json` — Zod validation runs inline (per FR 004-02), shows green checkmark for valid manifest
4. Clicks **"Register"** → loading spinner during registration → success toast: "Plugin 'crm-plugin' registered as draft"
5. Reviews the plugin in the **Plugin Catalog** table — sees status `draft` with actions dropdown
6. Clicks **"Publish"** → confirmation dialog: "Publishing makes this plugin available to all tenants. Confirm?" → clicks Confirm
7. Plugin transitions to `published` — immediately appears in tenant marketplaces (per US-001)

**Outcome**: Plugin is live in all tenant marketplaces. Marco can now monitor its health via container status and event lag metrics.

**Emotional Map**:
- Step 1–2: 😐 Neutral — routine navigation  
- Step 3: 😊 Relieved — validation catches errors before registration  
- Step 4–5: 😐 Neutral — standard CRUD confirmation  
- Step 6: 🎯 Decisive — one click, platform-wide impact  
- Outcome: 💡 Satisfied — process was smooth, no manual intervention

**Edge Cases**:
- **Step 3, Error**: Manifest is invalid JSON or missing required fields → Zod errors shown inline with field-level messages. Form stays open; user fixes and retries.
- **Step 4, Error**: Container image pull fails (registry auth or network) → error banner: "Failed to pull image from [registry]. Check credentials and network connectivity." Plugin marked with `pull_failed` status. Retry button present.
- **Step 6, Permission denied**: Non-super-admin user attempts to access → 403 page with message "Only platform administrators can manage the plugin catalog. Contact your system administrator."

### Journey 2: Marco — Investigate & Retry Failed Events (DLQ Flow)

**Trigger**: Prometheus alert fires — consumer lag exceeded threshold on `plexica.plugin.dlq` topic.

**Steps**:
1. Opens **Super Admin Panel** → navigates to **System → Dead Letter Queue** (per FR 004-18)
2. Sees a DLQ table: event type, plugin name, retry count, failure timestamp, status badges
3. Filters by **plugin** = `crm-plugin` → table narrows to 12 failed events — all `plexica.workspace.created` type
4. Clicks an event row → **detail panel** expands inline showing full payload JSON, error stack trace, and event headers
5. Recognizes the error: null pointer in plugin handler (now fixed in v1.1.0)
6. Selects all 12 events using the bulk checkbox → dropdown appears with **"Retry Selected (12)"** and **"Dismiss Selected (12)"**
7. Clicks **"Retry Selected"** → confirmation dialog → loading spinner → success: "12 events re-published for retry"
8. Events transition to `retried` status in the table. Marco returns to dashboard — lag alert resolves within 30s.

**Outcome**: Failed events recovered, plugin backend processes them on next poll cycle. No data loss.

**Emotional Map**:
- Step 1–2: 😤 Frustrated — alert disrupted work  
- Step 3–4: 🔍 Investigating — drilling into the problem  
- Step 5–6: 💡 Insight — found the cause, solution is clear  
- Step 7–8: 🎉 Satisfied — bulk retry resolved everything cleanly  
- Outcome: 😊 Relieved — system operability proven

**Edge Cases**:
- **Step 2, Empty**: No failed events → empty state: "All events processed successfully. No failed events in the last 30 days." with a link to consumer lag dashboard.
- **Step 3, Filtered empty**: No events match filter → "No events match 'crm-plugin'. Try different filters or [clear filters]."
- **Step 7, Partial failure**: Some events retry failed → mixed-result toast: "10 of 12 events re-published. 2 events failed — see below." Table updates showing status changes.

---

## Persona 2: Elena — Tenant Administrator

**Role**: Admin for "Acme Corp" tenant (50 users, 5 workspaces)  
**Goal**: Provide her team with the right tools via plugins without disrupting existing workflows or exposing sensitive data  
**Pain points**:  
- Cannot trial plugins safely — installing affects all workspaces immediately  
- No clear data-loss warnings when uninstalling plugins  
- Difficult to manage per-workspace plugin access from a single view  

**Tech literacy**: Medium (comfortable with SaaS admin panels, not technical enough to read Docker logs)  
**Device preference**: Desktop (admin work), Mobile (approval notifications, rare)  
**Accessibility needs**: None  
**Quote**: *"I want my marketing team to have CRM, but the finance team shouldn't see it."*

### Journey 3: Elena — Discover, Install & Configure Plugin (Happy Path)

**Trigger**: Marketing team lead requests CRM functionality for their workspace.

**Steps**:
1. Opens **Tenant Admin Panel** → navigates to **Plugins** in left sidebar
2. Lands on the **Marketplace** tab — sees a grid of plugin cards with search bar at top
3. Types "CRM" in search → marketplace grid filters in real-time to show matching plugins
4. Clicks the **CRM Plugin** card → detail sheet slides in: full description, author, version, categories, declared actions summary, table names
5. Reads action declarations: `crm:contact:create`, `crm:contact:read`, `crm:deal:create` — understands what permissions the plugin requires
6. Clicks **"Install"** → confirmation dialog: "Install CRM Plugin? This will: create 3 database tables, start a backend container, enable for all workspaces (you can adjust per-workspace)."
7. Clicks Confirm → progress steps appear: [Pulling image...] → [Running migrations...] → [Starting container...] → checkmarks appear as each completes
8. Installation complete → success toast: "CRM Plugin installed and enabled for all workspaces"
9. Navigates to **Installed Plugins** tab → sees CRM Plugin with `Active` status badge
10. Scrolls to **Workspace Visibility** section → toggles off "Finance" workspace (per FR 004-06, DR-16) → save confirmation

**Outcome**: CRM plugin available for Marketing workspace only. Elena can adjust visibility for other workspaces later.

**Emotional Map**:
- Step 1–3: 😐 Neutral — browsing, standard UX  
- Step 4–5: 🤔 Curious — reviewing what the plugin does and needs  
- Step 6–7: 🎯 Decisive — understands implications, installs with confidence  
- Step 8–10: 💡 Satisfied — granular workspace control works as expected  
- Outcome: 😊 Relieved — marketing gets CRM, finance stays unaffected

**Edge Cases**:
- **Step 6, Install fails (migration error)**: Progress steps show error at migration stage → error banner: "Migration 'crm_contacts.sql' failed: duplicate table name. The plugin was not installed. Contact your system administrator." Plugin not registered in installed list.
- **Step 6, Image pull timeout**: Progress spinner runs > 30s → error: "Image pull timed out. The registry may be slow. The plugin was not installed. Try again later or contact your system administrator."
- **Step 10, Permission denied**: Non-tenant-admin attempts visibility toggle → API 403, toggle snaps back to its previous state, toast: "Only tenant administrators can manage workspace visibility."

### Journey 4: Elena — Uninstall Plugin with Data Warning (Edge Case Focus)

**Trigger**: Marketing team stopped using CRM; Elena decides to uninstall to reduce clutter and resource usage.

**Steps**:
1. Opens **Tenant Admin Panel** → **Plugins** → **Installed** tab
2. Finds **CRM Plugin** in the list (status: `Active`) → clicks **"Uninstall"** action
3. **Confirmation dialog** opens with warning header and data inventory:
   ```
   ⚠️ Data Loss Warning
   Uninstalling CRM Plugin will permanently delete:
     - crm_contacts (247 records)
     - crm_deals (89 records)
     - crm_activities (512 records)
   This action cannot be undone.
   ```
4. Types "UNINSTALL" in the confirmation text field (per Constitution: no `window.confirm()`)
5. Clicks **"Permanently Uninstall"** destructive button → loading spinner
6. Uninstall progress: [Stopping container...] → [Dropping tables...] → [Removing consumer group...]
7. Plugin removed from installed list → toast: "CRM Plugin uninstalled. Associated data permanently deleted."

**Outcome**: Plugin fully removed. Elena returns to a cleaner installed plugins list.

**Emotional Map**:
- Step 1–2: 😐 Neutral — standard action  
- Step 3–4: 🎯 Decisive — explicit warning forces deliberate action; typing confirmation prevents accidents  
- Step 5–6: 😐 Neutral — system processing  
- Step 7: 😊 Relieved — cleanup complete, no surprises

---

## Persona 3: Dev — Plugin Developer (Third-Party)

**Role**: Independent developer building plugins for Plexica marketplace  
**Goal**: Build, test, and ship a plugin with minimal friction; validate it works in a real tenant context before submission  
**Pain points**:  
- Tight feedback loop during development needed (HMR for UI, watch mode for backend)  
- Unclear what the shell provides vs what they must build  
- Difficult to debug auth issues in plugin-to-core communication  

**Tech literacy**: High (TypeScript, React, Docker, comfortable with CLI)  
**Device preference**: Desktop (development)  
**Accessibility needs**: None  
**Quote**: *"I just want to scaffold, code, test locally, and ship. Don't make me configure Webpack."*

### Journey 5: Dev — Scaffold, Develop & Test Plugin Locally (Happy Path)

**Trigger**: Dev wants to build a "Time Tracking" plugin for Plexica.

**Steps**:
1. Runs `npx create-plexica-plugin time-tracker` in terminal (per FR 004-29)
2. CLI prompts: plugin name (autofilled), description, author → Dev inputs details
3. CLI generates project in `./time-tracker/` with: `manifest.json`, `vite.config.ts` (MF preset pre-configured), `src/` (backend TypeScript), `ui/` (React frontend), `Dockerfile`, `migrations/`
4. Runs `pnpm install && pnpm dev` → local dev server starts:
   - UI at `localhost:5173` with HMR via Vite MF preset (per FR 004-13)
   - Backend at `localhost:3000` with tsx watch mode
   - Shell host auto-registers the local plugin remote
5. Opens `localhost:5173` → sees Plexica shell with **sidebar: Time Tracker** entry
6. Clicks Time Tracker → full-width workspace panel renders plugin UI (empty state: "No time entries yet. Start tracking!")
7. Modifies `ui/App.tsx` → change triggers HMR, UI updates instantly in the shell
8. Adds backend route `POST /api/entries` → `tsx watch` auto-restarts; tests via curl from terminal
9. Verifies event subscription works: creates a test workspace in the local shell → plugin logs show event received
10. Builds Docker image: `pnpm build && docker build -t registry.example.com/time-tracker:1.0.0 .`

**Outcome**: Plugin is fully developed and dockerized. Ready to push to registry and submit to Plexica super admin for registration.

**Emotional Map**:
- Step 1–3: 😊 Delighted — scaffolding just works, zero config  
- Step 4–6: 💡 Insight — seeing their code live in the real shell feels real  
- Step 7–8: 😊 Satisfied — tight feedback loop (HMR + watch) makes development fast  
- Step 10: 🎯 Decisive — single build command, ready to ship

**Edge Cases**:
- **Step 1, CLI Error**: Directory `time-tracker` already exists → CLI prompts: "Directory already exists. Overwrite? [y/N]". With `--force` flag, overwrites automatically.
- **Step 5, MF load failure**: Remote entry 404 → shell shows error boundary fallback: "Plugin 'time-tracker' unavailable. Check that dev server is running on port 5173." with retry button.
- **Step 8, Auth failure**: Backend call to core API fails with 401 → SDK `callApi` returns structured error: `{ status: 401, error: "Token expired" }`. Dev adds token refresh logic.

---

## Journey Summary

| # | Persona | Journey | Type | FR Coverage |
|---|---------|---------|------|------------|
| J1 | Marco (Super Admin) | Register & Publish Plugin | Happy | 004-01, 004-02, US-001 |
| J2 | Marco (Super Admin) | Investigate & Retry DLQ Events | Happy + Edge | 004-18, 004-19, DR-17 |
| J3 | Elena (Tenant Admin) | Discover, Install & Configure | Happy + Edge | 004-03, 004-06, 004-28, DR-16, US-002 |
| J4 | Elena (Tenant Admin) | Uninstall with Data Warning | Edge Case Focus | 004-05, DR-16 |
| J5 | Dev (Plugin Developer) | Scaffold, Develop & Test | Happy + Edge | 004-29, 004-13, 004-30 |

## Data-Driven Journey Annotations

For data-heavy journeys (J2 — DLQ, J3 — Marketplace browsing):

- **J2 Exploration**: Non-linear — Marco starts broad (full DLQ table), narrows by plugin filter, drills into individual event, bulk-operates on filtered set. Context (filter state) preserved when inspecting individual events.
- **J3 Drill-down**: Elena starts exploring (browse grid) → filters by search → inspects detail (detail sheet) → decides (reviews permissions) → acts (installs). The detail sheet in step 4–5 is the decision point.
- **J3 Comparison**: Elena implicitly compares plugins in the marketplace grid (read descriptions, scan permissions, check ratings).
- **Dead ends**: J2 filtered-to-empty (no events for plugin), J3 search-no-match (no CRM plugins), J4 permission denied (non-admin cannot uninstall).
