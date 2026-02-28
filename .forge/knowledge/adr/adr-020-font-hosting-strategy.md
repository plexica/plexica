# ADR-020: Font Hosting Strategy for Tenant Theming

> Architectural Decision Record documenting the strategy for hosting and
> delivering tenant-configurable web fonts. Resolves CSP, GDPR/privacy,
> and performance implications of font loading in a multi-tenant SaaS
> platform. Created for Spec 005 (Frontend Architecture) FR-009/FR-010,
> resolving design-spec Open Question #3.

| Field    | Value                               |
| -------- | ----------------------------------- |
| Status   | Accepted                            |
| Author   | forge-architect                     |
| Date     | 2026-02-26                          |
| Deciders | Architecture Team, Security, DevOps |

**Accepted**: February 26, 2026 — Accepted after adversarial review confirmed compliance with Constitution Art. 1.2, 5, and 9. No HIGH issues found in ADR content itself.

---

## Context

Spec 005 (FR-009) requires tenant administrators to configure **heading
and body font families** as part of their organization's branding. The
design-spec (Screen 5: Tenant Theme Settings) shows font selector
dropdowns for heading and body fonts, and Open Question #3 explicitly
asks:

> "Font selector options: should available fonts be limited to a curated
> list (Google Fonts subset) or allow any web font URL? — Medium —
> affects security (CSP) and performance"

The font hosting strategy has significant implications across four
dimensions:

### 1. Content Security Policy (CSP)

Plexica must define `font-src` and `style-src` directives in its CSP
headers. The chosen strategy determines whether those directives allow
third-party origins (e.g., `fonts.googleapis.com`, `fonts.gstatic.com`)
or restrict to `'self'` only.

### 2. GDPR / Privacy

**Google Fonts from Google's CDN transmits user IP addresses to Google
on every page load.** In January 2022, a Munich court (LG München,
Az. 3 O 17493/20) ruled that embedding Google Fonts from Google's
servers violates GDPR Article 6(1) because user IPs are transferred to
Google without user consent. Multiple EU data protection authorities
have since issued similar guidance. For a multi-tenant SaaS platform
with European customers, this is a material legal risk.

This directly tensions with Constitution Article 5.2.2 ("No PII in
Logs") and the broader security-first principle (Article 1.2.1): if
the platform's architecture causes user IP addresses to be transmitted
to a third party without consent, the platform itself becomes a vector
for privacy violations.

### 3. Performance

Font files are typically 20–100 KB per weight/style. Loading strategies
affect:

- **Time to First Contentful Paint (FCP)**: Render-blocking font
  requests add latency. Google Fonts requires two round-trips (CSS
  file → font binary), while self-hosted fonts can be preloaded in a
  single hop.
- **Cache efficiency**: Third-party CDN caches are per-origin and have
  been partitioned by browsers since Chrome 86 (2020), meaning
  Google Fonts can no longer share cache across sites. Self-hosted
  fonts benefit from the same cache as other site assets.
- **3G performance budget**: Constitution Article 1.3 and NFR-003
  require page load < 2s on 3G. Font loading must not exceed this
  budget.

### 4. Implementation Complexity

MinIO (S3-compatible object storage) is already in the approved stack
(Constitution Article 2.1). Plugin assets are already served from
CDN/S3. Self-hosted fonts can reuse this infrastructure.

### Requirements Driving This Decision

| Req        | Summary                                                        |
| ---------- | -------------------------------------------------------------- |
| FR-009     | Tenant theme includes font families (heading, body)            |
| FR-010     | Theme applied via CSS custom properties / TailwindCSS tokens   |
| NFR-001    | Shell load time < 1.5s on 3G                                   |
| NFR-003    | Page load < 2s on 3G (with plugin), per Constitution Art. 1.3  |
| Art. 1.2.1 | Security First — no feature ships without security review      |
| Art. 5.2.1 | All data in transit over TLS 1.2+                              |
| Art. 5.2.2 | PII must never appear in logs or leak to third parties         |
| Art. 5.3.1 | All external input validated with Zod schemas                  |
| Art. 2.1   | MinIO already in approved stack (S3-compatible object storage) |
| Art. 4.3   | P95 API response time < 200ms; page load < 2s on 3G            |

---

## Options Considered

### Option A: Self-Hosted Fonts via MinIO/CDN (Chosen)

- **Description**: Curate a list of ~20–30 popular open-source fonts
  (from Google Fonts, Font Squirrel, etc.). Download the font files
  (WOFF2 format) at build time or via a one-time setup script. Store
  them in MinIO under a `/fonts/` prefix. Serve to the frontend from
  the platform's own origin (or CDN backed by MinIO). The font selector
  dropdown offers only these curated fonts.
- **Pros**:
  - **No third-party requests**: `font-src 'self'` (or platform CDN
    origin) in CSP — tightest possible policy. Eliminates XSS font
    injection vectors entirely.
  - **GDPR compliant by default**: No user data (IP, headers) is
    transmitted to Google or any third party for font loading. Zero
    legal risk for EU customers.
  - **Optimal performance**: Fonts served from same origin or dedicated
    CDN. Single round-trip (no CSS → font binary chain). Fonts can be
    preloaded via `<link rel="preload" as="font" crossorigin>`. WOFF2
    compression reduces file sizes to 15–30 KB per weight.
  - **Cache partition benefit**: Same-origin fonts share the browser
    cache with other platform assets. No cross-site cache partitioning
    penalty.
  - **Infrastructure reuse**: MinIO is already in the approved stack
    (Art. 2.1) and used for plugin assets. No new infrastructure
    required.
  - **Deterministic builds**: Font files versioned in the repository
    or CI artifact store. No external dependency at runtime.
  - **Tenant isolation maintained**: All tenants share the same curated
    font library. No tenant-uploaded font files (which would require
    malware scanning — font files can contain exploits via crafted
    OpenType tables).
- **Cons**:
  - **Limited selection**: ~20–30 fonts vs. 1,500+ on Google Fonts.
    Tenants cannot use arbitrary fonts. Mitigated by selecting the most
    popular fonts that cover Latin, Cyrillic, CJK subsets.
  - **Maintenance overhead**: Font files must be updated when new
    versions are released (rare — font updates are infrequent).
  - **Storage cost**: ~50 MB for 25 fonts × 4 weights = 100 files.
    Negligible for MinIO.
  - **Initial effort**: One-time script to download, subset, and
    convert fonts to WOFF2. Medium effort.
- **Effort**: Medium

### Option B: Google Fonts CDN (Direct Loading)

- **Description**: Load fonts directly from `fonts.googleapis.com`
  (CSS) and `fonts.gstatic.com` (binaries) at runtime. The font
  selector offers any Google Font by name.
- **Pros**:
  - **Huge selection**: 1,500+ fonts available immediately.
  - **Zero storage**: No font files to store or maintain.
  - **Simple implementation**: Just inject a `<link>` tag with the
    Google Fonts CSS URL. Minimal code.
  - **Google CDN performance**: Google's global CDN is fast — but
    see cache partitioning caveat below.
- **Cons**:
  - **GDPR violation risk**: User IPs transmitted to Google on every
    page load. LG München ruling (2022) found this violates GDPR
    Art. 6(1). Multiple EU DPAs have issued similar guidance.
    Plexica's EU customers would need cookie consent banners just for
    font loading — poor UX and legal liability.
  - **Wider CSP surface**: Requires `font-src fonts.gstatic.com` and
    `style-src fonts.googleapis.com` in CSP headers. Each additional
    allowed origin increases the attack surface for XSS injection.
  - **Two round-trips**: Browser must fetch CSS from
    `fonts.googleapis.com`, parse it, then fetch font binaries from
    `fonts.gstatic.com`. Adds ~100–200ms latency on 3G.
  - **Cache partitioning**: Since Chrome 86, the browser cache is
    partitioned by top-level origin. Google Fonts resources cached
    for `app.plexica.io` are NOT reused for `other.site.com`. The
    historical "shared cache" benefit no longer exists.
  - **External dependency**: If Google Fonts is down or slow (rare but
    has happened), tenant UIs degrade — text renders in fallback
    system fonts with visible FOUT (Flash of Unstyled Text).
  - **Violates Constitution Art. 1.2.1**: Security First — shipping a
    feature that transmits PII to a third party without consent
    review violates the security-first principle.
- **Effort**: Low

### Option C: Hybrid — Self-Hosted Default + Tenant-Uploaded Custom Fonts

- **Description**: Provide a curated self-hosted font library (like
  Option A) as the default, but also allow tenant admins to upload
  custom font files (WOFF2) that are stored in MinIO under the
  tenant's storage prefix.
- **Pros**:
  - **Maximum flexibility**: Tenants can use their proprietary brand
    fonts (e.g., "Acme Sans" custom typeface).
  - **Self-hosted benefits**: All Option A benefits for default fonts.
  - **No third-party CDN**: Custom fonts also served from platform
    origin. CSP stays tight.
- **Cons**:
  - **Security risk — font file exploits**: Font files (OTF, TTF,
    WOFF2) have been vectors for code execution exploits (CVE-2015-2426
    Windows, CVE-2023-41993 WebKit, multiple Chrome sandbox escapes).
    Accepting user-uploaded font files requires:
    - File type validation (magic bytes, not just extension)
    - Font sanitization (strip potentially malicious OpenType tables)
    - Malware scanning
    - This is significant security engineering effort.
  - **Multi-tenancy complexity**: Each tenant's custom fonts must be
    isolated (one tenant's uploaded font must not leak to another).
    Requires tenant-scoped MinIO paths and signed URLs.
  - **CSP complication**: If fonts are served from tenant-specific
    MinIO paths, `font-src` must allow all those paths — or use a
    wildcard, which weakens CSP.
  - **Accessibility risk**: Custom fonts may not include proper
    OpenType metrics, hinting, or character coverage — breaking
    WCAG 2.1 AA compliance (Art. 1.3).
  - **High complexity**: Font upload UI, validation pipeline, storage
    management, CSP path management — disproportionate effort for
    an edge case. Very few tenants will have proprietary fonts.
  - **Violates Constitution Art. 5.3**: User-uploaded font files are
    external input that requires deep validation beyond Zod schemas.
    Font binary validation is a specialized domain.
- **Effort**: High

### Option D: Third-Party Font Proxy (Privacy-Preserving)

- **Description**: Proxy Google Fonts requests through the platform's
  backend. The backend fetches font CSS and binaries from Google,
  caches them, and serves them to the frontend from the platform's
  own origin.
- **Pros**:
  - **Large selection**: Access to Google Fonts catalog without
    direct user-to-Google requests.
  - **Privacy preserved**: User IPs are not sent to Google; only the
    server IP is exposed.
  - **Self-hosted CSP**: `font-src 'self'` — same tight CSP as
    Option A.
- **Cons**:
  - **Licensing ambiguity**: Google Fonts ToS permit direct use but
    may not explicitly permit server-side proxying/caching at scale.
    Legal review required.
  - **Maintenance complexity**: Proxy must handle font CSS parsing
    (Google generates CSS dynamically based on `User-Agent` for
    optimal format selection), caching, TTL management, and
    error handling.
  - **Latency**: First request for a new font adds backend latency
    (fetch from Google → cache → serve). Subsequent requests are
    cached.
  - **New infrastructure**: Requires a caching proxy layer (or
    backend route) that doesn't currently exist.
  - **Over-engineered**: If we're going to cache fonts on our
    infrastructure anyway, we might as well self-host them
    directly (Option A) without the proxy complexity.
- **Effort**: High

---

## Decision

**Chosen option**: Option A — Self-Hosted Fonts via MinIO/CDN

**Rationale**: Self-hosted fonts are the only option that simultaneously
satisfies all four decision dimensions:

1. **CSP**: Enables the tightest possible policy (`font-src 'self'`).
   No third-party origins in the CSP whitelist. This minimizes the
   XSS attack surface, directly supporting Constitution Art. 1.2.1
   (Security First) and Art. 5.3 (Input Validation / XSS Prevention).

2. **GDPR/Privacy**: Zero user data transmitted to third parties for
   font loading. No consent banners required. No legal risk for EU
   customers. This aligns with Constitution Art. 5.2 (Data Protection)
   and the spirit of Art. 5.2.2 (No PII leakage).

3. **Performance**: Single-origin font loading with `<link rel="preload">`
   eliminates the two-round-trip penalty of Google Fonts. WOFF2
   compression keeps fonts at 15–30 KB per weight. Same-origin caching
   avoids cross-site cache partitioning. This supports NFR-001
   (< 1.5s shell load) and NFR-003 (< 2s page load on 3G).

4. **Simplicity**: Reuses MinIO infrastructure already in the approved
   stack. No new dependencies, no proxy layer, no font upload
   validation pipeline.

### Curated Font List

The platform ships with a curated list of **25 fonts** covering the
most popular choices for SaaS UI design. All fonts use open-source
licenses (SIL Open Font License or Apache 2.0) that permit
redistribution and self-hosting.

**Sans-serif** (primary use case for SaaS UIs):

| Font              | Weights Included   | License    | Notes                     |
| ----------------- | ------------------ | ---------- | ------------------------- |
| Inter             | 400, 500, 600, 700 | SIL OFL    | Default heading font      |
| Roboto            | 400, 500, 700      | Apache 2.0 | Default body font         |
| Open Sans         | 400, 600, 700      | SIL OFL    | High readability          |
| Lato              | 400, 700           | SIL OFL    | Clean, professional       |
| Source Sans 3     | 400, 600, 700      | SIL OFL    | Adobe, excellent for body |
| Nunito            | 400, 600, 700      | SIL OFL    | Rounded, friendly         |
| Poppins           | 400, 500, 600, 700 | SIL OFL    | Geometric, modern         |
| Work Sans         | 400, 500, 600, 700 | SIL OFL    | Optimized for screens     |
| DM Sans           | 400, 500, 700      | SIL OFL    | Low contrast, readable    |
| Plus Jakarta Sans | 400, 500, 600, 700 | SIL OFL    | Contemporary, balanced    |
| Noto Sans         | 400, 500, 700      | SIL OFL    | Widest Unicode coverage   |
| Manrope           | 400, 500, 600, 700 | SIL OFL    | Modern geometric          |
| Figtree           | 400, 500, 600, 700 | SIL OFL    | Friendly, clean           |

**Serif** (for heading variety):

| Font             | Weights Included | License | Notes                  |
| ---------------- | ---------------- | ------- | ---------------------- |
| Merriweather     | 400, 700         | SIL OFL | Screen-optimized serif |
| Playfair Display | 400, 700         | SIL OFL | Elegant display serif  |
| Lora             | 400, 700         | SIL OFL | Contemporary serif     |
| Source Serif 4   | 400, 600, 700    | SIL OFL | Adobe, professional    |
| Bitter           | 400, 700         | SIL OFL | Designed for screens   |

**Monospace** (for code/data-heavy tenants):

| Font            | Weights Included | License | Notes             |
| --------------- | ---------------- | ------- | ----------------- |
| JetBrains Mono  | 400, 700         | SIL OFL | Developer-focused |
| Fira Code       | 400, 700         | SIL OFL | Ligatures, coding |
| Source Code Pro | 400, 700         | SIL OFL | Adobe, clean mono |

**Display** (for heading-only use):

| Font          | Weights Included   | License | Notes                 |
| ------------- | ------------------ | ------- | --------------------- |
| Outfit        | 400, 500, 600, 700 | SIL OFL | Geometric display     |
| Space Grotesk | 400, 500, 700      | SIL OFL | Distinctive headings  |
| Sora          | 400, 500, 600, 700 | SIL OFL | Modern, geometric     |
| Rubik         | 400, 500, 700      | SIL OFL | Slightly rounded      |
| Raleway       | 400, 600, 700      | SIL OFL | Elegant, thin weights |

**Total storage estimate**: ~100 WOFF2 files × ~25 KB average = ~2.5 MB.
Negligible for MinIO.

### Font File Storage Structure

```
minio://plexica-assets/fonts/
├── inter/
│   ├── inter-400.woff2
│   ├── inter-500.woff2
│   ├── inter-600.woff2
│   └── inter-700.woff2
├── roboto/
│   ├── roboto-400.woff2
│   ├── roboto-500.woff2
│   └── roboto-700.woff2
├── ...
└── font-manifest.json          # Metadata: name, category, weights, license
```

### Font Manifest Schema

```typescript
// File: packages/shared-types/src/fonts.ts

export interface FontDefinition {
  id: string; // Kebab-case identifier: "inter", "open-sans"
  name: string; // Display name: "Inter", "Open Sans"
  category: 'sans-serif' | 'serif' | 'monospace' | 'display';
  weights: number[]; // Available weights: [400, 500, 600, 700]
  license: string; // "SIL OFL 1.1" | "Apache 2.0"
  fallback: string; // CSS fallback stack: "system-ui, sans-serif"
}

export const FONT_CATALOG: FontDefinition[] = [
  {
    id: 'inter',
    name: 'Inter',
    category: 'sans-serif',
    weights: [400, 500, 600, 700],
    license: 'SIL OFL 1.1',
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  // ... remaining fonts
];

export const DEFAULT_HEADING_FONT = 'inter';
export const DEFAULT_BODY_FONT = 'roboto';
```

### CSS Integration

Fonts are loaded dynamically based on the tenant's theme configuration:

```typescript
// File: apps/web/src/lib/font-loader.ts

export async function loadTenantFonts(headingFontId: string, bodyFontId: string): Promise<void> {
  const fonts = [headingFontId, bodyFontId];
  const uniqueFonts = [...new Set(fonts)];

  for (const fontId of uniqueFonts) {
    const definition = FONT_CATALOG.find((f) => f.id === fontId);
    if (!definition) continue;

    for (const weight of definition.weights) {
      const url = `/fonts/${fontId}/${fontId}-${weight}.woff2`;
      const fontFace = new FontFace(definition.name, `url(${url}) format('woff2')`, {
        weight: String(weight),
        display: 'swap',
      });
      await fontFace.load();
      document.fonts.add(fontFace);
    }
  }

  // Apply via CSS custom properties (per ADR-009 TailwindCSS tokens)
  const headingDef = FONT_CATALOG.find((f) => f.id === headingFontId);
  const bodyDef = FONT_CATALOG.find((f) => f.id === bodyFontId);

  if (headingDef) {
    document.documentElement.style.setProperty(
      '--font-heading',
      `"${headingDef.name}", ${headingDef.fallback}`
    );
  }
  if (bodyDef) {
    document.documentElement.style.setProperty(
      '--font-body',
      `"${bodyDef.name}", ${bodyDef.fallback}`
    );
  }
}
```

### CSP Headers

With self-hosted fonts, the CSP policy requires only:

```
Content-Security-Policy:
  font-src 'self';
  style-src 'self' 'unsafe-inline';
```

No third-party origins. No wildcards. Tightest possible font policy.

### Preloading Critical Fonts

For the default fonts (Inter + Roboto), preload hints are added to the
HTML `<head>` to eliminate render-blocking:

```html
<link rel="preload" href="/fonts/inter/inter-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/roboto/roboto-400.woff2" as="font" type="font/woff2" crossorigin />
```

Non-default tenant fonts use `font-display: swap` to show text
immediately in the fallback font, then swap to the custom font once
loaded (avoiding invisible text / FOIT).

---

## Consequences

### Positive

- **GDPR compliance by design**: No user IP addresses transmitted to
  third parties. Zero consent banner overhead. EU customers can adopt
  the platform without additional privacy review. Directly supports
  Constitution Art. 5.2.
- **Strongest possible CSP**: `font-src 'self'` eliminates font-based
  XSS injection vectors. No third-party domains in CSP whitelist.
  Supports Constitution Art. 1.2.1 (Security First), Art. 5.3.3
  (XSS Prevention).
- **Performance optimized**: Single-origin loading, WOFF2 compression,
  preloading default fonts, `font-display: swap`. Estimated font
  loading time: ~50ms on broadband, ~200ms on 3G — well within the
  2s page load budget (NFR-003).
- **No new dependencies**: Fonts served from existing MinIO/CDN
  infrastructure. No npm packages, no proxy servers, no font upload
  pipelines.
- **Deterministic**: Font files are static assets versioned in CI
  artifacts. No runtime dependency on external font services.
- **Tenant isolation maintained**: All tenants share the same curated
  font library. No tenant-specific font upload path eliminates a class
  of security concerns (font file exploits, cross-tenant font leakage).

### Negative

- **Limited font selection**: 25 curated fonts vs. 1,500+ on Google
  Fonts. Some tenants may want a font not in the curated list.
  **Mitigation**: The curated list covers the top 25 most popular
  web fonts by usage. The list can be expanded over time (adding a
  font requires only adding WOFF2 files + a manifest entry — no code
  changes). If a specific customer requires a proprietary font, this
  can be handled as a custom deployment or future ADR for tenant-uploaded
  fonts with proper security controls.
- **One-time setup effort**: A build script is needed to download,
  subset (Latin + Cyrillic + Vietnamese for broad coverage), and
  convert fonts to WOFF2. Estimated: 4–8 hours of DevOps effort.
- **Font updates**: When font foundries release updated versions
  (rare), the curated list must be manually updated. Mitigated by
  the infrequency of font updates.

### Neutral

- **Custom font upload deferred**: Option C (tenant-uploaded fonts)
  is explicitly deferred. If a future business requirement demands
  proprietary brand fonts, a new ADR should be created to address
  font file validation, sanitization, and tenant-scoped storage.
  This decision does not preclude that future extension.
- **Google Fonts proxy deferred**: Option D is over-engineered for
  current needs. If the curated list proves insufficient, a proxy
  approach could be revisited — but the self-hosting infrastructure
  built for Option A would make it redundant.

---

## Constitution Alignment

| Article | Alignment    | Notes                                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅ COMPLIANT | **Security First** (Art. 1.2.1): self-hosting eliminates third-party data transmission. **Page load < 2s** (Art. 1.3): preloaded WOFF2 fonts add < 200ms even on 3G. **WCAG 2.1 AA** (Art. 1.3): curated fonts all include proper metrics and hinting.                                                                                                                                       |
| Art. 2  | ✅ COMPLIANT | **No new dependencies**: uses existing MinIO (Art. 2.1). Font files are static assets, not npm packages. **No dependency policy tension** (Art. 2.2).                                                                                                                                                                                                                                        |
| Art. 3  | ✅ COMPLIANT | **Feature module organization** (Art. 3.2): font loading logic in `apps/web/src/lib/font-loader.ts`, font types in `packages/shared-types/src/fonts.ts`. **API standards** (Art. 3.4): font selector data available via existing `GET /api/v1/tenant/settings` endpoint.                                                                                                                     |
| Art. 4  | ✅ COMPLIANT | **Performance targets** (Art. 4.3): WOFF2 fonts at ~25 KB/weight with preloading. P95 font load time < 100ms on broadband.                                                                                                                                                                                                                                                                   |
| Art. 5  | ✅ COMPLIANT | **TLS** (Art. 5.2.1): fonts served from same origin, inheriting TLS. **No PII leakage** (Art. 5.2.2): no third-party requests means no IP/header transmission. **XSS Prevention** (Art. 5.3.3): `font-src 'self'` CSP blocks injected external font URLs. **Input validation** (Art. 5.3.1): font selection validated against `FONT_CATALOG` via Zod enum — no arbitrary font URLs accepted. |
| Art. 6  | ✅ COMPLIANT | **Operational error handling** (Art. 6.1): if a font file fails to load, `font-display: swap` ensures text remains visible in fallback font. Error logged at `warn` level.                                                                                                                                                                                                                   |
| Art. 7  | ✅ COMPLIANT | **File naming** (Art. 7.1): `font-loader.ts` (kebab-case). **Database naming** (Art. 7.2): N/A — fonts stored in MinIO, not database.                                                                                                                                                                                                                                                        |
| Art. 8  | ✅ COMPLIANT | **Testable** (Art. 8.2): font loading can be unit tested with mock `FontFace` API. Font catalog validation testable with Zod schema tests. No external dependencies in tests.                                                                                                                                                                                                                |
| Art. 9  | ✅ COMPLIANT | **Feature flags** (Art. 9.1.1): custom font selection can be rolled out behind a feature flag (default fonts always available). **Safe migrations** (Art. 9.1.3): no database migration needed.                                                                                                                                                                                              |

---

## Follow-Up Actions

- [ ] Create font download/subset script (`scripts/download-fonts.sh`) —
      downloads WOFF2 files for all 25 curated fonts from Google Fonts
      API (server-side, one-time) and places them in the MinIO
      `plexica-assets/fonts/` bucket
- [ ] Define `FontDefinition` type and `FONT_CATALOG` constant in
      `packages/shared-types/src/fonts.ts`
- [ ] Implement `font-loader.ts` in `apps/web/src/lib/` with `FontFace`
      API loading and CSS custom property application
- [ ] Add `<link rel="preload">` hints for default fonts (Inter 400,
      Roboto 400) in `apps/web/index.html`
- [ ] Set CSP header `font-src 'self'` in the platform's HTTP response
      headers (Fastify `@fastify/helmet` or reverse proxy config)
- [ ] Add Zod validation for font selection in the tenant theme update
      endpoint (`PUT /api/v1/tenant/settings`) — validate `fonts.heading`
      and `fonts.body` against `FONT_CATALOG` IDs
- [ ] Update font selectors in Tenant Theme Settings UI (design-spec
      Screen 5) to use `FONT_CATALOG` as the options source
- [ ] Add unit tests for `font-loader.ts` (mock `FontFace` API)
- [ ] Add integration test for tenant theme update with font validation
- [ ] Close design-spec Open Question #3 — resolved by this ADR
- [ ] Update ADR README index with ADR-020 entry

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

## Related Decisions

- [ADR-009: TailwindCSS v4 Semantic Tokens](adr-009-tailwindcss-v4-tokens.md) —
  font CSS custom properties (`--font-heading`, `--font-body`) integrate
  with the existing token system defined in ADR-009
- [ADR-011: Vite Module Federation](adr-011-vite-module-federation.md) —
  plugin frontends inherit tenant fonts via CSS custom properties set on
  the shell's `<html>` element
- Spec 005 FR-009, FR-010: `.forge/specs/005-frontend-architecture/spec.md`
- Design-spec Screen 5, Open Question #3:
  `.forge/specs/005-frontend-architecture/design-spec.md`
- Spec 010 (Frontend Production Readiness) Phase 2 (Tenant Theming):
  `.forge/specs/010-frontend-production-readiness/spec.md`
- Constitution Articles 1.2.1, 1.3, 2.1, 5.2, 5.3

## References

- [LG München GDPR ruling on Google Fonts (2022)](https://rewis.io/urteile/urt/lhm-20-01-2022-3-o-1749320/) —
  German court ruling that embedding Google Fonts violates GDPR
- [Chrome cache partitioning (2020)](https://developer.chrome.com/blog/http-cache-partitioning) —
  eliminates cross-site cache sharing for third-party CDN resources
- [WOFF2 specification (W3C)](https://www.w3.org/TR/WOFF2/) — compressed
  font format used for self-hosted fonts
- [FontFace API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/FontFace) —
  JavaScript API for programmatic font loading
- [font-display CSS property](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display) —
  controls text visibility during font loading
- [CVE-2023-41993 (WebKit font exploit)](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2023-41993) —
  example of font file security vulnerability (relevant to Option C rejection)
