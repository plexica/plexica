# ADR-025: Real XML Parser for SVG Active-Content Scanning

> Architectural Decision Record for the `assertSafeSvg` rewrite (PR review
> branch `review/codebase-revision`).

| Field | Value |
| --- | --- |
| Status | Accepted |
| Author | forge-architect |
| Date | 2026-08-11 |
| Deciders | Plexica Team |

**Driver**: Four consecutive review rounds (rounds 4–7) each produced a new
bypass against the hand-rolled SVG lexer; Rule 5 requires an ADR for the new
core dependency `@xmldom/xmldom`.
**Related**: Spec 003 (logo upload with SVG support), ADR-013.

## Context

Uploaded SVG logos are stored in MinIO and served back with
`Content-Type: image/svg+xml`, so any active content in the markup executes
in our origin. `assertSafeSvg` (services/core-api/src/lib/svg-safety.ts)
rejects dangerous payloads before storage.

The first implementation scanned the raw text with regexes plus a
hand-rolled, quote-aware tag lexer (svg-tag-scan.ts). Four review rounds
each found a structural bypass that the previous fix could not express:

1. **Padding window** — bounding the tag+attribute regex to `{0,4096}` to
   avoid catastrophic backtracking let `href="https://evil…"` slip through
   behind >4096 bytes of inert attributes.
2. **Quote smuggling** — a literal `>` inside a quoted attribute value
   (`<image a=">" href=…>`) truncated tag extraction; the quote-aware lexer
   fixed it, at the cost of a second hand-rolled state machine.
3. **Character references** — XML decodes `&#106;avascript:` to a live
   `javascript:` URL after tokenising; the fix scanned a decoded copy too,
   which in turn re-broke on `&#62;` (a decoded `>` swallows the rest of a
   tag in one copy but not the other), forcing dual raw+decoded scans.
4. **Namespace prefixes** — `<x:image>` is resolved by namespace URI in a
   browser, not by raw name; the lexer had to grow prefix-skipping logic.

Each fix added lexer complexity while the grammar it approximates (quotes,
char-refs, namespaces, CDATA, comments, PIs) is exactly what an XML parser
implements correctly by construction. The class of bug is not any single
bypass: it is the decision to reimplement XML tokenisation by hand.

## Options Considered

### Option A: Keep patching the hand-rolled lexer

- **Pros**: No new dependency.
- **Cons**: Four consecutive bypasses demonstrate the approach cannot track
  the XML grammar; each patch grows a new adversarial surface; correctness
  arguments must be re-derived per patch.
- **Effort**: Low per patch, unbounded over time.

### Option B: Drop SVG upload support

- **Pros**: Eliminates the threat class entirely.
- **Cons**: Product deviation — SVG logo support is a declared capability
  (spec 003); rejecting the format punishes users for an implementation
  problem.
- **Effort**: Low.

### Option C: fast-xml-parser

- **Pros**: Small and fast.
- **Cons**: A builder, not a DOM: it produces plain JS objects, loses node
  kinds we must reason about (comments, CDATA, processing instructions need
  extra configuration and are not uniformly preserved), and its namespace
  handling is opt-in string manipulation — closer to the lexer's failure
  mode than to a real parser.
- **Effort**: Medium.

### Option D: @xmldom/xmldom (chosen)

- **Pros**: Complete, W3C-compliant XML parser producing a real DOM
  (elements, attributes, comments, CDATA, PIs as typed nodes);
  char-ref-decoded attribute values; namespace-aware local names; ~10M
  weekly downloads; actively maintained (0.9.10, 2026); performs no I/O and
  refuses to expand DTD entities (reports `entity not found`), so classic
  XXE is not possible; fails fast and linearly on malformed input.
- **Cons**: New runtime dependency (~100 KB); error reporting is
  callback-based, so fail-closed behaviour must be configured explicitly.
- **Effort**: Low.

## Decision

**Chosen option**: Option D.

1. Add `@xmldom/xmldom@^0.9.10` to `services/core-api` dependencies. The
   caret range on a 0.x line resolves only within 0.9.x (>=0.9.10 <0.10.0).
2. `assertSafeSvg` parses the payload once with
   `new DOMParser({ locator: false, onError })` and walks the DOM with an
   iterative stack, evaluating declarative rules: forbidden element local
   names (`script`, `iframe`, `embed`, `object`, `foreignObject`,
   `handler`), `on*` event-handler attributes, `javascript:` in
   href/src/from/to/values, remote refs (`http:`, `https:`, protocol- and
   backslash-relative) on `image`/`use`/`feImage`, SMIL `set`/`animate`
   targeting any `*href` attribute, `@import` in `<style>`, and
   `xml-stylesheet` processing instructions.
3. **Any** parser diagnostic (warning, error or fatalError) rejects the
   upload: xmldom downgrades to "warning" constructs that a browser's XML
   parser treats as fatal, so the only safe policy is fail-closed.
4. The document is rejected pre-parse if it contains `<!DOCTYPE` (raw,
   case-insensitive scan). This kills the whole DTD/entity class
   deterministically, independent of parser version behaviour. Trade-off:
   the legacy `<!DOCTYPE svg PUBLIC …>` prologue emitted by old SVG 1.1
   exporters is refused with a clear error message — modern exporters omit
   it, and re-exporting flattens it away.
5. The payload Buffer is never mutated; parsing only informs the
   accept/reject decision. URL-valued attributes are normalised the way the
   WHATWG URL parser does (strip tab/LF/CR anywhere, trim leading
   C0/space, treat `\` as `/`) before scheme checks.
6. Delete svg-tag-scan.ts (the hand-rolled lexer) and the dual raw/decoded
   scan machinery; svg-safety.ts keeps the entire policy in one file under
   the 200-line limit.
7. Coverage boundary is unchanged and explicit: CSS `url(https://…)` paint
   references, remote media referenced by `<audio>`/`<video>`, and
   `<a href="https://…">` links remain accepted residual risk (inert unless
   the SVG is opened directly and interacted with).

## Consequences

### Positive

- The bypass class (parser differentials between the lexer and a real XML
  parser) is eliminated structurally: there is no longer any hand-rolled
  tokenisation to diverge from the browser.
- Correctness is by construction: attribute values arrive char-ref-decoded,
  namespace local names resolved, comments/CDATA/PIs typed — the rule set
  reads as a flat list of declarative checks.
- Malformed XML fails closed in single-digit milliseconds, replacing the
  lexer-era ReDoS concerns with a linear real parser.

### Negative

- New core dependency (~100 KB) whose own parsing behaviour becomes part of
  the trust base; pinned within 0.9.x and covered by regression tests.
- Old SVG 1.1 exports carrying a `<!DOCTYPE svg PUBLIC …>` prologue are
  rejected (deliberate, documented, and remedied by re-export).
- Deliberate conservative false positive: the literal text `<!DOCTYPE`
  inside a comment or CDATA rejects the file (no real export produces it).

### Neutral

- Public behaviour is unchanged: same `InvalidFileTypeError`, same
  re-export through file-upload.ts, same stored-bytes guarantee.
- The pre-parser test suite (patterns, padding, anti-ReDoS budgets, false
  positives) is preserved; malformed-input tests now assert fast rejection
  instead of silent acceptance.

## Security and GDPR

- xmldom performs no I/O and refuses to expand DTD entities; the pre-parse
  DOCTYPE rejection makes XXE and entity-expansion DoS impossible by
  policy, not by parser version.
- Error messages name the violated rule, never the payload content — no PII
  or file bytes leave the process in logs or responses.
- Tenant isolation is unaffected: the scanner runs before storage and
  touches no tenant state.

## Constitution Alignment

| Article | Alignment | Notes |
| --- | --- | --- |
| Rule 1 / Testing | Compliant | Full regression suite for every bypass from rounds 4–7, fail-closed malformed-XML tests, timing budgets, false-positive tests on legitimate SVGs. |
| Rule 4 / File size | Compliant | svg-safety.ts ~180 lines; svg-tag-scan.ts deleted. |
| Rule 5 / ADR | Compliant | This record precedes merge; covers the new core dependency. |
| Security: input validation | Improved | Real parser replaces hand-rolled lexer; fail-closed on any diagnostic. |

## Follow-Up Actions

- [x] Accept this ADR before merge (accepted 2026-08-11).
- [ ] Monitor `@xmldom/xmldom` releases; re-run the SVG regression suite on upgrade.

## Lifecycle

```text
Proposed --> Accepted --> [Deprecated | Superseded by ADR-NNN]
```
