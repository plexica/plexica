# FORGE Review Report — Specs & Documentation Analysis

**Date**: February 22, 2026  
**Branch**: `review/specs-and-docs-analysis`  
**Reviewer**: forge-reviewer (adversarial, automated)  
**Scope**: All 11 FORGE specs + full documentation suite  
**Overall Status**: ⚠️ WARN — 6 specs incomplete, 7 HIGH documentation issues

---

## Part 1 — Spec Analysis

### Summary Table

| Spec                        | spec.md | plan.md | tasks.md | FR Count | NFRs | No Clarifications | Plan Covers FRs | Spec Status        | Overall   |
| --------------------------- | ------- | ------- | -------- | -------- | ---- | ----------------- | --------------- | ------------------ | --------- |
| 001 Multi-Tenancy           | ✅      | ❌      | ❌       | 15 FRs   | 6    | ✅                | N/A (no plan)   | Approved           | ⚠️ WARN   |
| 002 Authentication          | ✅      | ✅      | ✅       | 16 FRs   | 8    | ✅                | ✅              | Approved           | ✅ PASS   |
| 003 Authorization           | ✅      | ❌      | ❌       | 15 FRs   | 6    | ✅                | N/A (no plan)   | Approved           | ⚠️ WARN   |
| 004 Plugin System           | ✅      | ❌      | ❌       | 17 FRs   | 8    | ✅                | N/A (no plan)   | Approved           | ⚠️ WARN   |
| 005 Frontend Architecture   | ✅      | ❌      | ❌       | 15 FRs   | 8    | ✅                | N/A (no plan)   | Approved           | ⚠️ WARN   |
| 006 i18n                    | ✅      | ✅      | ✅       | 14 FRs   | 5    | ✅                | ✅              | Approved           | ✅ PASS   |
| 007 Core Services           | ✅      | ❌      | ❌       | 14 FRs   | 8    | ✅                | N/A (no plan)   | Approved           | ⚠️ WARN   |
| 008 Admin Interfaces        | ✅      | ❌      | ❌       | 14 FRs   | 8    | ✅                | N/A (no plan)   | Approved           | ⚠️ WARN   |
| 009 Workspace Mgmt          | ✅      | ✅      | ✅       | 40 FRs   | 24   | ✅                | ✅              | ✅ IMPLEMENTED     | ✅ PASS   |
| 010 Frontend Prod Readiness | ✅      | ✅      | ✅       | 13 FRs   | 8    | ✅                | ✅              | **Draft**          | ⚠️ WARN   |
| 011 Workspace Hierarchy     | ✅      | ✅      | ✅       | 34 FRs   | 38   | ⚠️ 1 in plan      | ✅              | 🔴 NOT IMPLEMENTED | ✅ PASS\* |

> \*011 flagged for 1 `[NEEDS CLARIFICATION]` marker found in `spec.md` notice block (non-blocking).

---

### Per-Spec Issues

#### Spec 001 — Multi-Tenancy

- **[WARNING]** No `plan.md` or `tasks.md` — implementation status is inferred, not formally tracked
- **[WARNING]** Constitution compliance section acknowledges non-compliance with Art. 4.1 (63% vs 80% coverage target) — not resolved
- **[INFO]** Only 3 user stories for a foundational spec; consider expanding for clarity on tenant lifecycle

#### Spec 002 — Authentication

- **[INFO]** Most complete spec in the repository — serves as the reference model
- **[INFO]** 58 total story points across tasks; all phases documented

#### Spec 003 — Authorization

- **[WARNING]** No `plan.md` or `tasks.md` — 15 FRs with no implementation roadmap
- **[INFO]** ABAC explicitly deferred to Phase 3 (out of scope for MVP) — this is acceptable but should be tracked as a deferred decision

#### Spec 004 — Plugin System

- **[WARNING]** No `plan.md` or `tasks.md` — 17 FRs with no implementation roadmap
- **[WARNING]** Plugin isolation and security (FR-010, FR-011) are critical but have no formal implementation plan

#### Spec 005 — Frontend Architecture

- **[WARNING]** No `plan.md` or `tasks.md` — 15 FRs with no implementation roadmap
- **[WARNING]** Module Federation (FR-007, FR-008) covered by ADR-004/011 but spec has no plan linking ADRs to implementation tasks

#### Spec 006 — i18n

- **[INFO]** Completed — 28 story points, 100% implemented per PROJECT_STATUS.md
- **[INFO]** Clarification log shows 2 sessions resolving 16 ambiguities — exemplary process

#### Spec 007 — Core Services

- **[WARNING]** No `plan.md` or `tasks.md` — 14 FRs with no implementation roadmap
- **[WARNING]** Job queue (FR-010, FR-011) and event bus (FR-012, FR-013) are infrastructure-level features that need formal planning

#### Spec 008 — Admin Interfaces

- **[WARNING]** No `plan.md` or `tasks.md` — 14 FRs with no implementation roadmap
- **[INFO]** Most complex UI spec (7 user stories, super admin + tenant admin split) — needs UX design phase

#### Spec 009 — Workspace Management

- **[INFO]** Brownfield spec — 85% implemented, 10 gap FRs tracked
- **[INFO]** Error response format documented as RESOLVED (simplified → standard Art. 6.2 format) but needs implementation verification
- **[WARNING]** Spec is ~2300+ lines — consider splitting into focused sub-specs for maintainability

#### Spec 010 — Frontend Production Readiness

- **[WARNING]** Status is **Draft**, not **Approved** — this is the only spec not approved
- **[CRITICAL]** Frontend test coverage at **2.4%** (target: 80%) — violates Constitution Art. 4.1 directly
- **[INFO]** 60 story points across 5 phases; Sprint 4 + Sprint 5 timeline defined

#### Spec 011 — Workspace Hierarchy & Templates

- **[INFO]** 1 `[NEEDS CLARIFICATION]` marker appears in a **notice block** in spec.md stating all questions ARE resolved — this is a false positive from the grep (the text says "No `[NEEDS CLARIFICATION]` markers remain")
- **[INFO]** 49 story points planned; ADR-013 (Materialised Path) and ADR-014 (WorkspacePlugin Scoping) referenced correctly
- **[INFO]** Performance analysis (§14 of plan.md) is exceptionally thorough — NFR-P01–P05 defined

---

### Spec Issues — Sorted by Severity

**[CRITICAL]**

1. **Spec 010**: Frontend test coverage at 2.4% — violates Constitution Art. 4.1 (≥80% required) — spec is in Draft status, blocks approval

**[WARNING]** 2. **Specs 001, 003, 004, 005, 007, 008**: Missing `plan.md` and `tasks.md` — 6 of 11 specs have no formal implementation plan 3. **Spec 001**: Constitution compliance section explicitly admits non-compliance with Art. 4.1 (coverage 63%) — unresolved technical debt 4. **Spec 004**: Plugin security requirements (isolation, sandboxing) have no implementation plan — high security risk per Constitution Art. 5 5. **Spec 010**: Draft status — spec must be approved before Sprint 4 implementation begins

**[INFO]** 6. **Spec 009**: ~2300-line spec is unwieldy — consider extracting gap FRs into Spec 009b 7. **Spec 008**: Admin interfaces spec needs UX design phase (`/forge-ux`) before planning 8. **Specs 001-008**: Consider running `/forge-plan` for all specs without plans to establish implementation roadmaps

---

## Part 2 — Documentation Review

### Documentation Health Score: **38/100**

| Dimension               | Score  | Key Issues                                                                                                              |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Correctness             | 30/100 | 4 broken spec links in README, version mismatch (0.1.0 vs 0.9.0), missing I18N_USAGE.md, logic bug in SECURITY.md       |
| Security                | 45/100 | Hardcoded credentials in README, stale security doc (1 year old), broken HTTPS check pattern                            |
| Maintainability         | 35/100 | 4+ stale docs (10 days to 1 year), duplicate metadata headers, empty directories                                        |
| Consistency             | 25/100 | Test counts disagree across 4 files, phase numbering incompatible across 3 planning docs, ADR index missing ADR-013/014 |
| Constitution Compliance | 50/100 | Consistency directive (AGENTS.md) not enforced, SECURITY.md stale vs Art. 5, ADR index incomplete                       |

---

### HIGH Issues

#### [HIGH-1] Broken Spec Links in README.md (lines 295–298)

**File**: `README.md:295-298`  
**Issue**: Four spec links use `./forge/specs/` (missing leading dot) instead of `./.forge/specs/`

```
❌ ./forge/specs/002-authentication/
✅ ./.forge/specs/002-authentication/
```

**Impact**: All spec links in the main README are broken — contributors get 404s  
**Fix**: Replace `./forge/specs/` with `./.forge/specs/` in 4 lines

#### [HIGH-2] Missing docs/I18N_USAGE.md

**File**: `README.md:310`  
**Issue**: `README.md` links to `./docs/I18N_USAGE.md` but the file lives at `apps/web/docs/I18N_USAGE.md`  
**Impact**: i18n documentation link in README is broken  
**Fix**: Update link to `./apps/web/docs/I18N_USAGE.md` or copy file to `docs/`

#### [HIGH-3] Version Mismatch

**Files**: `README.md:12` (v0.1.0) vs `planning/PROJECT_STATUS.md:7` (v0.9.0) vs `planning/ROADMAP.md:13` (v0.9.0 Alpha)  
**Issue**: README shows v0.1.0 — has never been updated from initial creation  
**Impact**: Stakeholders and contributors see wrong project version in the primary README  
**Fix**: Update `README.md:12` to `**Version**: 0.9.0`

#### [HIGH-4] Security Logic Bug in SECURITY.md

**File**: `docs/SECURITY.md:472` (approximate line)  
**Issue**: Code example contains: `!request.protocol === 'https'`  
Due to operator precedence: `(!request.protocol) === 'https'` → always `false`  
The HTTPS enforcement check **never triggers**  
**Impact**: Developers copying this security pattern into production code will have broken HTTPS enforcement  
**Fix**: Change to `request.protocol !== 'https'`

#### [HIGH-5] ADR Index Out of Sync

**File**: `.forge/knowledge/adr/README.md`  
**Issue**: ADR index only lists ADR-001 through ADR-012. ADR-013 (Materialised Path) and ADR-014 (WorkspacePlugin Scoping) exist in the directory but are not indexed.  
**Impact**: Developers consulting the ADR index miss 2 recent architectural decisions for Spec 011  
**Fix**: Add ADR-013 and ADR-014 to the index table in `.forge/knowledge/adr/README.md`

#### [HIGH-6] planning/DECISIONS.md Out of Sync with .forge/knowledge/adr/

**File**: `planning/DECISIONS.md`  
**Issue**: `planning/DECISIONS.md` last updated 2025-02-03, contains ADRs 001-011. ADRs 012, 013, 014 are missing.  
**Impact**: Two canonical ADR locations are 3 ADRs out of sync. Single-source-of-truth violation.  
**Fix**: Either deprecate `planning/DECISIONS.md` with a pointer to `.forge/knowledge/adr/`, or sync it

#### [HIGH-7] Hardcoded Credentials in README.md

**File**: `README.md:81-84`  
**Issue**: Default admin credentials (`admin@plexica.com / admin`, Keycloak `admin/admin`) are hardcoded in the public README  
**Impact**: Anyone deploying without changing defaults has their credentials publicly documented  
**Fix**: Replace with placeholder text and prominent "MUST CHANGE IN PRODUCTION" warning

---

### MEDIUM Issues

#### [MED-1] Stale docs/SECURITY.md

**File**: `docs/SECURITY.md`  
**Issue**: Last updated 2025-02-03 (over 1 year ago). Predates OAuth 2.0/PKCE implementation (Spec 002), i18n system, workspace hierarchy. Does not document JWKS validation, token refresh, plugin hook security patterns.  
**Impact**: The MANDATORY security reference doc is dangerously out of date  
**Fix**: Major update required (estimated 2-4 hours)

#### [MED-2] Test Count Inconsistencies Across 4 Files

**Issue**: Four files disagree on test count:

- `AGENTS.md:22`: 2,118+ total (1,855 backend + 263 i18n)
- `docs/TESTING.md:14`: 1,855+ total
- `README.md:29`: 2,200+
- `planning/PROJECT_STATUS.md:32`: ~2,300+
  **Fix**: Establish `planning/PROJECT_STATUS.md` as single source of truth; other docs should reference it

#### [MED-3] Milestone Numbering Collision in planning/MILESTONES.md

**Issue**: Phase 1 uses M2.1–M2.4 labels; Phase 2 ALSO uses M2.1–M2.6 labels. Same IDs, different milestones.  
**Fix**: Rename Phase 2 milestones to avoid collision (e.g., P2-M1 through P2-M6)

#### [MED-4] Phase Numbering Incompatible Across Planning Docs

**Issue**: `PROJECT_STATUS.md` uses Phase 3=i18n, Phase 4=Workspace; `ROADMAP.md`/`MILESTONES.md` use Phase 1–5 with different meanings  
**Fix**: Reconcile phase numbering across all planning documents

#### [MED-5] docs/TESTING.md Stale (10 days)

**File**: `docs/TESTING.md`  
**Issue**: Last updated Feb 11, 2026. Shows 1,855 tests and 63% coverage. `PROJECT_STATUS.md` (Feb 21) shows ~2,300+ tests and ~77% coverage.  
**Fix**: Update TESTING.md or add note directing to PROJECT_STATUS.md for current numbers

#### [MED-6] Duplicate Metadata Headers

**Files**: `planning/DECISIONS.md`, `docs/SECURITY.md`, `planning/ROADMAP.md`  
**Issue**: Each file has a duplicate metadata block (copy-paste artifact)  
**Fix**: Remove duplicate metadata block from each file (5 minutes)

#### [MED-7] specs/README.md Stale

**File**: `specs/README.md`  
**Issue**: Last updated 2025-02-03. Says "Total Documents: 8" but 12+ files exist. Does not reference any FORGE specs (002, 006, 009, 010, 011).  
**Fix**: Update to reflect current state

---

### LOW Issues

#### [LOW-1] Empty Directories

**Files**: `docs/examples/`, `docs/architecture/`  
**Issue**: Empty directories from content migrations. Confusing for new contributors.  
**Fix**: Remove or add placeholder READMEs

#### [LOW-2] AGENTS.md Markdown Nesting Bug

**File**: `AGENTS.md:7-57`  
**Issue**: 4-backtick fencing embeds markdown headers and 3-backtick blocks — renders as single code block in some parsers  
**Fix**: Restructure to use standard heading + code block patterns

#### [LOW-3] SECURITY.md Version History Has Placeholder Dates

**File**: `docs/SECURITY.md`  
**Issue**: Version history shows `2024-01-XX` placeholder dates  
**Fix**: Replace with actual dates or remove version history section

#### [LOW-4] Consistency Directive Not Enforced

**Issue**: `AGENTS.md` mandates running consistency checks before commits (version, date alignment). This directive is clearly not being followed — README is 8 months out of date.  
**Fix**: Add pre-commit hook or CI check to enforce cross-document consistency

---

## Part 3 — Recommended Actions

### Priority 1 — Quick Wins (< 15 minutes total)

| #   | Action                                           | File                                        | Time  |
| --- | ------------------------------------------------ | ------------------------------------------- | ----- |
| 1   | Fix broken spec links (`./forge/` → `./.forge/`) | `README.md:295-298`                         | 2 min |
| 2   | Fix broken I18N_USAGE.md link                    | `README.md:310`                             | 2 min |
| 3   | Fix version mismatch (0.1.0 → 0.9.0)             | `README.md:12`                              | 1 min |
| 4   | Fix HTTPS logic bug                              | `docs/SECURITY.md:~472`                     | 1 min |
| 5   | Add ADR-013 and ADR-014 to ADR index             | `.forge/knowledge/adr/README.md`            | 5 min |
| 6   | Remove duplicate metadata headers                | `DECISIONS.md`, `SECURITY.md`, `ROADMAP.md` | 5 min |

### Priority 2 — Important (1-2 hours)

| #   | Action                                                            | Owner     | Effort |
| --- | ----------------------------------------------------------------- | --------- | ------ |
| 7   | Add credentials warning to README                                 | DevEx     | 30 min |
| 8   | Sync `planning/DECISIONS.md` with ADR-012/013/014 or deprecate it | Architect | 30 min |
| 9   | Update `docs/TESTING.md` with current numbers                     | QA        | 30 min |
| 10  | Update `planning/ROADMAP.md` for Feb 11-22 completions            | PM        | 45 min |
| 11  | Approve Spec 010 (change status from Draft → Approved)            | PM        | 15 min |

### Priority 3 — Medium Term (before next sprint)

| #   | Action                                                | Notes                                |
| --- | ----------------------------------------------------- | ------------------------------------ |
| 12  | Create `plan.md` + `tasks.md` for Specs 003, 004, 005 | Run `/forge-plan` for each           |
| 13  | Create `plan.md` + `tasks.md` for Specs 007, 008      | `/forge-plan 007`, `/forge-plan 008` |
| 14  | Create `plan.md` for Spec 001                         | Retrospective — was it implemented?  |
| 15  | Reconcile phase numbering across all planning docs    | 1 hour                               |

### Priority 4 — Long Term

| #   | Action                                                   | Notes                                           |
| --- | -------------------------------------------------------- | ----------------------------------------------- | --------- |
| 16  | Major SECURITY.md update                                 | Add OAuth 2.0, PKCE, JWKS, plugin hook security | 2-4 hours |
| 17  | Add CI check for cross-document consistency              | Enforce AGENTS.md directive                     |
| 18  | Consider UX design phase for Spec 008 (Admin Interfaces) | `/forge-ux 008`                                 |

---

## Summary Statistics

| Category                                         | Count                     |
| ------------------------------------------------ | ------------------------- |
| Specs analyzed                                   | 11                        |
| Specs with full artifact chain (spec+plan+tasks) | 5                         |
| Specs missing plan+tasks                         | 6                         |
| Specs fully implemented                          | 2 (006-i18n, 009 partial) |
| Specs in Draft status                            | 1 (010)                   |
| Specs not yet started                            | 1 (011)                   |
| Unresolved `[NEEDS CLARIFICATION]` markers       | 0                         |
| Doc issues found (total)                         | 18                        |
| HIGH severity doc issues                         | 7                         |
| MEDIUM severity doc issues                       | 7                         |
| LOW severity doc issues                          | 4                         |
| Documentation health score                       | 38/100                    |

---

_Generated by FORGE forge-reviewer agent on February 22, 2026_  
_Branch: `review/specs-and-docs-analysis`_
