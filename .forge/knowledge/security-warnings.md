# Security Warnings and Technical Debt Issues

> Issues found during `/forge-review` of Milestone 4 implementation.
> These are WARNING-level issues that should be addressed before production.

**Created**: February 14, 2026  
**Last Updated**: February 14, 2026  
**Source**: Adversarial code review of plugin manifest integration  
**Total Issues**: 6 (5 WARNING + 1 INFO)  
**Status**: ✅ ALL 6 ISSUES RESOLVED (Feb 14, 2026)

---

## ✅ RESOLVED Issues

### ~~Issue #2: Unbounded Query - Memory Exhaustion Risk~~ ✅ FIXED

**Status**: ✅ Fixed on February 14, 2026  
**Fixed In**: `apps/core-api/src/services/plugin.service.ts` (lines 270-322)  
**Test Coverage**: `plugin-security-fixes.test.ts` (2 tests added)

**Resolution Summary**:
Replaced `findMany({ include: { installations: true } })` with 3 parallel `COUNT()` aggregation queries. Memory usage reduced from O(n) to O(1). Database handles aggregation, eliminating data transfer overhead.

**Details**: See `.forge/knowledge/decision-log.md` - "Milestone 4 Security Fixes Part 2"

---

### ~~Issue #3: Duplicate Validation in updatePlugin()~~ ✅ FIXED

**Status**: ✅ Fixed on February 14, 2026  
**Fixed In**: `apps/core-api/src/services/plugin.service.ts` (lines 128-161)  
**Test Coverage**: `plugin-security-fixes.test.ts` (3 tests added)

**Resolution Summary**:
Added `validatePluginManifest()` Zod validation to `updatePlugin()` method. Now enforces both Zod schema + custom validation (defense-in-depth), consistent with `registerPlugin()` pattern. Closes security bypass allowing invalid manifests via update endpoint.

**Details**: See `.forge/knowledge/decision-log.md` - "Milestone 4 Security Fixes Part 2"

---

### ~~Issue #6: Non-compliant Logging (console.log)~~ ✅ FIXED

**Status**: ✅ Fixed on February 14, 2026  
**Fixed In**:

- `apps/core-api/src/services/plugin.service.ts` (constructors + 4 console.log calls)
- `apps/core-api/src/lib/logger.ts` (new shared Pino logger)

**Test Coverage**: `plugin-security-fixes.test.ts` (3 tests + 3 Constitution compliance tests)

**Resolution Summary**:
Created shared Pino logger instance (`lib/logger.ts`). Updated `PluginRegistryService` and `PluginLifecycleService` constructors to accept optional `Logger` parameter. Replaced all `console.log/error/warn` with structured Pino logging. Logger passed to nested services.

**Details**: See `.forge/knowledge/decision-log.md` - "Milestone 4 Security Fixes Part 2"

---

### ~~Issue #1: ReDoS Vulnerability in Plugin Manifest Validation~~ ✅ FIXED

**Status**: ✅ Fixed on February 14, 2026  
**Fixed In**: `apps/core-api/src/services/plugin.service.ts` (lines 960-971)  
**Test Coverage**: `plugin-security-fixes.test.ts` (4 tests added)

**Resolution Summary**:
Replaced timeout-based `validateRegexSafety()` with `safe-regex2` library for comprehensive static analysis. Library detects nested quantifiers, excessive backtracking, and overlapping alternations. Provides actionable error messages for plugin developers.

**Details**: See `.forge/knowledge/decision-log.md` - "Milestone 4 Security Fixes Part 3"

---

## ~~WARNING Issues (Remaining)~~ ✅ ALL RESOLVED

### ~~Issue #1: ReDoS Vulnerability in Plugin Manifest Validation~~ ✅ MOVED TO RESOLVED

### ~~Issue #1: ReDoS Vulnerability in Plugin Manifest Validation~~ ✅ MOVED TO RESOLVED

**Status**: ✅ Fixed on February 14, 2026 (see Resolved Issues section above)

---

### ~~Issue #2: Unbounded Query in getPluginStats~~ ✅ MOVED TO RESOLVED

### ~~Issue #2: Unbounded Query in getPluginStats~~ ✅ MOVED TO RESOLVED

**Status**: ✅ Fixed on February 14, 2026 (see Resolved Issues section above)

---

### ~~Issue #3: Duplicate Validation in updatePlugin()~~ ✅ MOVED TO RESOLVED

### ~~Issue #3: Duplicate Validation in updatePlugin()~~ ✅ MOVED TO RESOLVED

**Status**: ✅ Fixed on February 14, 2026 (see Resolved Issues section above)

---

### ~~Issue #4: Code Duplication (Logger and Service Instantiation)~~ ✅ FIXED

### ~~Issue #4: Code Duplication (Logger and Service Instantiation)~~ ✅ FIXED

**Status**: ✅ Fixed on February 14, 2026 (Security Fixes Part 2)  
**Fixed In**:

- `apps/core-api/src/services/plugin.service.ts` (constructors refactored)
- `apps/core-api/src/lib/logger.ts` (shared Pino logger created)

**Test Coverage**: `plugin-security-fixes.test.ts` (3 tests for shared logger verification)

**Resolution Summary**:
Created shared Pino logger instance in `lib/logger.ts`. Both `PluginRegistryService` and `PluginLifecycleService` constructors now accept optional `customLogger?: Logger` parameter with fallback to shared logger. Logger is passed consistently to nested services (ServiceRegistryService, DependencyResolutionService). No duplication remains.

**Details**: See `.forge/knowledge/decision-log.md` - "Milestone 4 Security Fixes Part 3 (Issue #4 Verification)"

---

### ~~Issue #5: Unimplemented Version Check (Dependency Compatibility)~~ ✅ FIXED

### ~~Issue #5: Unimplemented Version Check (Dependency Compatibility)~~ ✅ FIXED

**Status**: ✅ Fixed on February 14, 2026  
**Fixed In**: `apps/core-api/src/services/plugin.service.ts` (lines 916-923)  
**Test Coverage**: `plugin-security-fixes.test.ts` (5 tests added)

**Resolution Summary**:
Implemented semver validation in `validateDependencies()` using `semver.satisfies()`. Now validates exact versions, ranges, and complex operators (e.g., `^2.0.0`, `>=1.5.0 <2.0.0`). Error messages include both required and installed versions for debugging. Prevents incompatible plugin installations that would cause runtime failures.

**Details**: See `.forge/knowledge/decision-log.md` - "Milestone 4 Security Fixes Part 3"

---

## ~~INFO Issue~~ ✅ RESOLVED

### ~~Issue #6: Non-Compliant Logging (Constitution Violation)~~ ✅ MOVED TO RESOLVED

### ~~Issue #6: Non-Compliant Logging (Constitution Violation)~~ ✅ MOVED TO RESOLVED

**Status**: ✅ Fixed on February 14, 2026 (see Resolved Issues section above)

---

## Summary

| Issue # | Title                       | Severity | Status      | Fixed Date   |
| ------- | --------------------------- | -------- | ----------- | ------------ |
| 1       | ReDoS vulnerability         | WARNING  | ✅ RESOLVED | Feb 14, 2026 |
| 2       | Unbounded query (memory)    | WARNING  | ✅ RESOLVED | Feb 14, 2026 |
| 3       | Duplicate validation logic  | WARNING  | ✅ RESOLVED | Feb 14, 2026 |
| 4       | Code duplication (logger)   | WARNING  | ✅ RESOLVED | Feb 14, 2026 |
| 5       | Unimplemented version check | WARNING  | ✅ RESOLVED | Feb 14, 2026 |
| 6       | Non-compliant logging       | INFO     | ✅ RESOLVED | Feb 14, 2026 |

**Remediation Complete**: All 6 issues resolved on February 14, 2026

---

## Test Coverage

**All Tests Added** (February 14, 2026):

- **File**: `apps/core-api/src/__tests__/plugin/unit/plugin-security-fixes.test.ts`
- **Total Test Count**: 23 comprehensive tests
  - **Part 2** (11 tests):
    - 2 tests for Issue #2 (COUNT aggregation performance)
    - 3 tests for Issue #3 (Zod + custom validation enforcement)
    - 3 tests for Issue #6 (Pino logger integration)
    - 3 tests for Constitution compliance verification
  - **Part 3** (12 tests):
    - 4 tests for Issue #1 (ReDoS detection with safe-regex2)
    - 5 tests for Issue #5 (semver version checking)
    - 3 tests for Issue #4 (shared logger verification)

**Overall Test Status**: 836/836 tests passing (814 existing + 11 Part 2 + 11 Part 3)

---

## Tracking

**✅ ALL ISSUES RESOLVED** (February 14, 2026):

**Security Remediation Complete**:

- ~~Issue #1: ReDoS Vulnerability~~ ✅ Fixed Feb 14, 2026 (Part 3)
- ~~Issue #2: Unbounded Query~~ ✅ Fixed Feb 14, 2026 (Part 2)
- ~~Issue #3: Validation Bypass~~ ✅ Fixed Feb 14, 2026 (Part 2)
- ~~Issue #4: Code Duplication~~ ✅ Fixed Feb 14, 2026 (Part 2 + Part 3 verification)
- ~~Issue #5: Version Check~~ ✅ Fixed Feb 14, 2026 (Part 3)
- ~~Issue #6: Non-compliant Logging~~ ✅ Fixed Feb 14, 2026 (Part 2)

**Remediation Timeline**:

- **Part 1** (Feb 14, 2026): 3 CRITICAL issues (cross-tenant bypass, path traversal, transaction integrity)
- **Part 2** (Feb 14, 2026): 3 WARNING/INFO issues (#2, #3, #6)
- **Part 3** (Feb 14, 2026): 3 WARNING issues (#1, #4 verification, #5)

**No GitHub Issues Needed**: All issues resolved during Milestone 4 security hardening.

---

## References

- **Source**: `/forge-review` adversarial code review (Milestone 4, Feb 14 2026)
- **Related Documents**:
  - `.forge/constitution.md` (Articles 5, 6)
  - `docs/SECURITY.md` (Security best practices)
  - `apps/core-api/docs/PLUGIN_TRANSLATIONS.md` (Plugin developer guide)
  - `.forge/knowledge/decision-log.md` (Milestone 4 Security Fixes Part 2)

---

_Last Updated: February 14, 2026_  
_Status: ✅ ALL 6 ISSUES RESOLVED - Security remediation complete_
