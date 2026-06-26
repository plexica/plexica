# ADR-014: Hybrid UI Delivery Model

**Status**: Proposed
**Date**: 2026-06-26
**Driver**: DR-14 from Spec 004 (Plugin System) — Plugin UI Asset Delivery Strategy
**Extends**: ADR-005 (Module Federation Plugin UI)
**Deciders**: TBD

## Context

Plugin frontend assets are compiled as Module Federation bundles (`remoteEntry.js` + chunks)
by `@plexica/vite-plugin`, per ADR-005. These bundles must be served to end-user browsers.
Three delivery models were evaluated:

1. **Serve from plugin container**: The plugin container hosts its own UI assets
   alongside its API. Container health directly affects UI availability — if the
   container is restarting, crashing, or not yet started, the plugin UI is
   unavailable. Container cold starts (image pull → container start → health check)
   can take 5-30 seconds, leaving users with broken UI during that window.
2. **Serve from MinIO as static CDN assets**: Upload MF bundles to MinIO object
   storage at plugin registration time. The shell's MF host fetches from MinIO
   via signed URLs. Container-independent — UI is available regardless of backend
   state. Cache-friendly for CDN distribution.
3. **Embedded in shell bundle**: Bundle plugin code into the shell application at
   build time. Fastest delivery but creates security concerns (plugin code runs
   with shell privileges), version coupling (shell rebuild on plugin change),
   and contradicts the runtime extensibility requirement from ADR-005.

The core tension: containers provide runtime isolation for backend code but are
poor static asset servers. Plugin UI is static JavaScript — it does not need
a running process to be delivered.

## Decision

**Hybrid model — MinIO for production, Vite dev server for development.**

### Production: MinIO Static Asset Delivery

Plugin MF bundles are uploaded to MinIO at plugin registration time as immutable,
version-tagged objects. The shell's Module Federation host fetches `remoteEntry.js`
from MinIO via pre-signed URLs with configurable expiry.

**Object path convention**:
```
plugins/{plugin-slug}/{version}/remoteEntry.js
plugins/{plugin-slug}/{version}/assets/{contenthash}.js
plugins/{plugin-slug}/{version}/assets/{contenthash}.css
```

**Registration flow**:
1. Plugin developer builds the MF bundle (`@plexica/vite-plugin build` → `dist/`)
2. Plugin package (container image + UI bundle) is uploaded to the platform
3. Core validates the manifest and extracts the `uiAssets` section
4. Core uploads `dist/` contents to MinIO under `plugins/{slug}/{version}/`
5. Core registers the `remoteEntry.js` URL in `plugin_registry.ui_remote_entry_url`
6. At runtime, the shell generates a pre-signed GET URL (5-minute expiry) and
   passes it to Module Federation's `loadRemote()`

**Benefits**:
- Container restarts, crashes, or upgrades never affect UI availability
- MinIO serves as a CDN origin — assets are cacheable and distributable
- Cold start time eliminated for UI (container still starting → UI still works)
- Plugin UI version is immutable once uploaded (no in-place mutations)

### Development: Vite Dev Server

During plugin development (per ADR-013 §4, Plugin Rapid Development Mode), the
Vite dev server serves MF assets directly with HMR (Hot Module Replacement).
The dev registration endpoint (`POST /api/v1/dev/plugins/register`) receives a
`uiUrl` pointing to the dev server:

```json
{
  "slug": "my-plugin",
  "backendUrl": "http://localhost:4002",
  "uiUrl": "http://localhost:4001/remoteEntry.js",
  "extensionPoints": ["sidebar:admin"],
  "actions": [{ "key": "crm:contact:create", "defaultRole": "member" }],
  "events": { "subscribes": ["plexica.workspace.*"] },
  "declaredTables": ["crm_contacts", "crm_deals"]
}
```

The shell's dev watcher registers this URL as a dynamic MF remote, enabling
sub-second feedback cycles with HMR.

### Security: Pre-Signed URLs

MinIO pre-signed URLs for `remoteEntry.js` are generated server-side at access
time with a 5-minute expiry. The signed URL is passed to the frontend as part
of the plugin manifest response. Expired URLs are refreshed transparently by
the shell before fetching assets.

Block-diagram reference would list the DC-NAME-defined bucket policies:
- `plexica-plugins` bucket: private access, pre-signed URLs only
- Upload permissions: `write-only` for the core-api service account
- No public read access — every fetch requires a valid signed URL

### Bundle Validation

Before uploading to MinIO, the core validates the MF bundle:
- `remoteEntry.js` must exist and be non-empty
- Bundle must declare `exposes` matching the manifest's `extensionPoints`
- Bundle size must not exceed `MAX_PLUGIN_UI_BUNDLE_SIZE` (default: 5 MB)
- No inline scripts exceeding Content-Security-Policy constraints

## Consequences

### Positive
- **UI decoupled from container health**: Plugin UI is static HTML/JS/CSS —
  it does not need a running backend to be delivered. Container restarts, crashes,
  or cold starts never degrade the user experience.
- **CDN compatibility**: MinIO as origin enables CDN caching. `remoteEntry.js`
  is version-tagged and immutable, so cache invalidation is never needed for
  existing versions.
- **Fast cold loads**: Users see the plugin UI immediately after page load,
  regardless of whether the container has finished starting. The UI renders
  immediately; API calls gracefully degrade with loading states if the container
  is not yet ready.
- **Simplified container lifecycle**: Plugin containers only handle API requests
  and event processing. No need for static file serving, CORS headers, or
  caching logic in the container.

### Negative
- **Upload step adds complexity to registration**: The 11-step plugin installation
  flow now includes a MinIO upload step. However, this is a one-time operation
  at registration time and does not affect runtime.
- **Pre-signed URL generation**: Each page load requires a server-side call to
  generate a signed URL for `remoteEntry.js`. Mitigated by caching the signed
  URL in Redis (4.5-minute TTL, leaving a 30-second refresh window).
- **Dev-prod asset path divergence**: Development uses Vite dev server URLs;
  production uses MinIO. The shell already handles this via the `uiUrl` field
  in the plugin registration payload — no code path divergence needed.

### Neutral
- **MinIO becomes a hard dependency for plugin UI delivery**: MinIO was already
  provisioned for core object storage (user avatars, file attachments). Plugin
  UI assets are a natural extension of this existing service.

## Alternatives Considered

| Alternative | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Serve from Container** | Plugin container serves UI via nginx or Express static | Single packaging unit (one container = everything) | UI unavailable during container restart/crash; container must run for UI; cold starts break UX; container must handle CORS, caching, CSP | Rejected — violates NFR-02 (UI must not depend on backend availability) |
| **Embedded in Shell** | Plugin code bundled into shell at build time | Fastest possible delivery; no network request for plugin code | Security risk (plugin code runs with shell privileges); shell rebuild on every plugin change; contradicts ADR-005 runtime extensibility | Rejected — violates ADR-005 and security model |
| **MinIO Only (no dev server)** | Always serve from MinIO, even in development | Single code path | Requires build + upload on every code change during development (15-30s feedback loop) | Rejected for development — dev experience degradation |

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| Rule 5: ADR for decision | **COMPLIANT** | This ADR documents the UI asset delivery strategy, a significant infrastructure decision. |
| Security §2: Authentication | **COMPLIANT** | Pre-signed URLs with short expiry prevent unauthorized access to plugin assets. |
| Architecture: Plugins | **COMPLIANT** | Consistent with constitution §85 — Module Federation plugin UI. MinIO is the delivery mechanism. |
| Technology Stack | **COMPLIANT** | MinIO is already in the stack. No new dependencies required. |

## Related Decisions

- **ADR-005: Module Federation Plugin UI** — Defines the Module Federation mechanism for plugin UI composition. This ADR defines *where* the MF bundles are served from.
- **ADR-013: Container Hosting Model** — Defines the container lifecycle and dev mode. This ADR's MinIO delivery decouples UI from the container lifecycle defined in ADR-013.
- **ADR-020: Plugin Reinstall = Update Flow** — UI asset versioning and MinIO upload during plugin updates follows this delivery model.
