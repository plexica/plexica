# Security Warnings and Technical Debt Issues

> Issues found during `/forge-review` of Milestone 4 implementation.
> These are WARNING-level issues that should be addressed before production.

**Created**: February 14, 2026  
**Last Updated**: February 14, 2026  
**Source**: Adversarial code review of plugin manifest integration  
**Total Issues**: 6 (5 WARNING + 1 INFO)  
**Status**: 3 issues fixed (Feb 14, 2026); 3 remaining

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

## WARNING Issues (Remaining)

### Issue #1: ReDoS Vulnerability in Plugin Manifest Validation

**Severity**: WARNING (Medium-High Risk)  
**File**: `apps/core-api/src/services/plugin.service.ts:891-913`  
**Method**: `validateRegexSafety()`

**Description**:
The plugin manifest validation uses a simple regex timeout mechanism that can be bypassed with carefully crafted patterns, potentially leading to Regular Expression Denial of Service (ReDoS) attacks.

**Current Code**:

```typescript
private async validateRegexSafety(pattern: string, maxTime: number = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), maxTime);
    try {
      new RegExp(pattern);
      clearTimeout(timeout);
      resolve(true);
    } catch {
      clearTimeout(timeout);
      resolve(false);
    }
  });
}
```

**Vulnerability**:

- Malicious plugin authors can craft regex patterns that cause CPU exhaustion
- The timeout mechanism doesn't interrupt the `RegExp` constructor execution
- No protection against catastrophic backtracking patterns
- Attack vector: Malicious plugin manifest with crafted regex in route patterns

**Impact**:

- Server CPU exhaustion
- Denial of Service for all tenants sharing the same server
- Potential security breach if combined with other vulnerabilities

**Recommended Fix**:

```typescript
import safeRegex from 'safe-regex2';

private validateRegexSafety(pattern: string): boolean {
  // Use safe-regex2 library for static analysis
  if (!safeRegex(pattern)) {
    throw new Error(
      'Unsafe regex pattern detected (potential ReDoS). ' +
      'Avoid nested quantifiers and excessive backtracking.'
    );
  }
  return true;
}
```

**Alternative Fix** (if library not acceptable):

```typescript
import { Worker } from 'worker_threads';

private async validateRegexSafety(pattern: string, maxTime: number = 1000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort } = require('worker_threads');
      try {
        new RegExp(${JSON.stringify(pattern)});
        parentPort.postMessage({ success: true });
      } catch (error) {
        parentPort.postMessage({ success: false, error: error.message });
      }
    `, { eval: true });

    const timeout = setTimeout(() => {
      worker.terminate();
      resolve(false); // Regex took too long
    }, maxTime);

    worker.on('message', (msg) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve(msg.success);
    });
  });
}
```

**Acceptance Criteria**:

- [ ] Replace timeout-based validation with `safe-regex2` library
- [ ] Add test cases for known ReDoS patterns (e.g., `(a+)+b`, `(a*)*b`)
- [ ] Update plugin validation error messages to be actionable
- [ ] Document regex safety requirements in `PLUGIN_TRANSLATIONS.md`

**Priority**: Medium (fix before production deployment)

---

### Issue #2: Unbounded Query in getPluginStats

**Severity**: WARNING (Medium Risk)  
**File**: `apps/core-api/src/services/plugin.service.ts:263-292`  
**Method**: `getPluginStats()`

**Description**:
The `getPluginStats()` method loads ALL plugin installations into memory to count them, which can cause memory exhaustion for popular plugins with thousands of tenants.

**Current Code**:

```typescript
async getPluginStats(pluginId: string): Promise<PluginStats> {
  const plugin = await db.plugin.findUnique({
    where: { id: pluginId },
    include: {
      installations: true, // ⚠️ Loads ALL installations into memory
    },
  });

  const stats: PluginStats = {
    totalInstallations: plugin.installations.length,
    activeInstallations: plugin.installations.filter(i => i.status === 'ACTIVE').length,
    // ...
  };
}
```

**Vulnerability**:

- For popular plugins with 10,000+ tenants, this loads megabytes of data into memory
- Can cause Node.js out-of-memory errors
- Scales linearly with adoption (O(n) memory usage)

**Impact**:

- Server crashes for popular plugins
- Degraded performance for all requests during query execution
- Potential DoS vector by repeatedly calling stats endpoint

**Recommended Fix**:

```typescript
async getPluginStats(pluginId: string): Promise<PluginStats> {
  // Use database aggregation queries instead of loading all rows
  const [totalCount, activeCount, enabledCount] = await Promise.all([
    db.tenantPlugin.count({
      where: { pluginId },
    }),
    db.tenantPlugin.count({
      where: { pluginId, status: 'ACTIVE' },
    }),
    db.tenantPlugin.count({
      where: { pluginId, enabled: true },
    }),
  ]);

  const stats: PluginStats = {
    totalInstallations: totalCount,
    activeInstallations: activeCount,
    enabledInstallations: enabledCount,
  };

  return stats;
}
```

**Acceptance Criteria**:

- [ ] Replace `include: { installations: true }` with aggregation queries
- [ ] Add performance test with 10,000+ mock installations
- [ ] Verify memory usage stays under 50MB even for popular plugins
- [ ] Update API documentation with performance characteristics

**Priority**: Medium (fix before scaling to production traffic)

---

### Issue #3: Duplicate Validation Logic (Inconsistent Rules)

**Severity**: WARNING (Medium Risk)  
**File**: `apps/core-api/src/services/plugin.service.ts:55-62, 131-132`  
**Methods**: `registerPlugin()` and `updatePlugin()`

**Description**:
The `updatePlugin()` method bypasses Zod validation entirely, while `registerPlugin()` enforces strict validation. This creates inconsistent behavior and potential security bypass.

**Current Code**:

**registerPlugin()** (lines 55-62):

```typescript
async registerPlugin(manifest: PluginManifest): Promise<Plugin> {
  // ✅ Zod validation enforced
  const validatedManifest = PluginManifestSchema.parse(manifest);
  // ...
}
```

**updatePlugin()** (lines 131-132):

```typescript
async updatePlugin(pluginId: string, updates: Partial<PluginManifest>): Promise<Plugin> {
  // ❌ NO Zod validation - direct database update
  return await db.plugin.update({
    where: { id: pluginId },
    data: { manifest: updates as Prisma.JsonValue },
  });
}
```

**Vulnerability**:

- Plugin authors can bypass validation by using `updatePlugin()` instead of `registerPlugin()`
- Invalid manifest data can be persisted to database
- Security constraints (translation file validation, API schema) can be bypassed
- Inconsistent business rules across methods

**Impact**:

- Potential data corruption (invalid manifests in database)
- Security bypass (e.g., install plugin with valid manifest, update to bypass file size checks)
- Maintenance burden (two codepaths for same business logic)

**Recommended Fix**:

```typescript
async updatePlugin(pluginId: string, updates: Partial<PluginManifest>): Promise<Plugin> {
  // Load existing plugin to get full manifest
  const existingPlugin = await db.plugin.findUniqueOrThrow({
    where: { id: pluginId },
  });

  const existingManifest = existingPlugin.manifest as unknown as PluginManifest;

  // Merge updates with existing manifest
  const updatedManifest = { ...existingManifest, ...updates };

  // ✅ Validate merged manifest with Zod
  const validatedManifest = PluginManifestSchema.parse(updatedManifest);

  // Validate translation files if translations field changed
  if (updates.translations) {
    await this.validateTranslationFiles(pluginId, validatedManifest);
  }

  // Update with validated manifest
  return await db.plugin.update({
    where: { id: pluginId },
    data: { manifest: validatedManifest as Prisma.JsonValue },
  });
}
```

**Acceptance Criteria**:

- [ ] Consolidate validation logic into shared method `validatePluginManifest()`
- [ ] Apply Zod validation to both `registerPlugin()` and `updatePlugin()`
- [ ] Add integration test: register valid plugin → update with invalid data → verify rejection
- [ ] Document validation requirements in API docs

**Priority**: Medium (fix before allowing plugin updates in production)

---

### Issue #4: Code Duplication (Logger and Service Instantiation)

**Severity**: WARNING (Low-Medium Risk)  
**File**: `apps/core-api/src/services/plugin.service.ts:29-48, 415-431`  
**Impact**: Maintenance burden, potential inconsistency

**Description**:
Logger instances and service dependencies are instantiated multiple times throughout the service, leading to:

- Multiple Pino logger instances (memory overhead)
- Inconsistent logger context (some have metadata, some don't)
- Service coupling (multiple `new PluginLifecycleService()` instantiations)

**Current Code** (repeated pattern):

```typescript
// Line 29-48: Constructor
constructor() {
  this.logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    // ... configuration repeated
  });
  this.pluginRegistry = new PluginRegistry();
  this.eventBus = new EventBus();
}

// Line 415-431: installPlugin method
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // ... same configuration again
});
```

**Maintenance Issues**:

- Changes to logger configuration must be replicated across multiple locations
- Risk of inconsistent log formats or levels
- Harder to mock for testing
- Violates DRY (Don't Repeat Yourself) principle

**Recommended Fix**:

**Create a logger factory**:

```typescript
// File: src/lib/logger.ts
import pino from 'pino';

export function createLogger(context: string) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: { colorize: true },
          }
        : undefined,
  }).child({ context });
}
```

**Use dependency injection**:

```typescript
export class PluginService {
  private logger: pino.Logger;
  private pluginRegistry: PluginRegistry;
  private eventBus: EventBus;

  constructor(logger?: pino.Logger, registry?: PluginRegistry, eventBus?: EventBus) {
    this.logger = logger || createLogger('PluginService');
    this.pluginRegistry = registry || new PluginRegistry();
    this.eventBus = eventBus || new EventBus();
  }
}
```

**Acceptance Criteria**:

- [ ] Extract logger factory to `src/lib/logger.ts`
- [ ] Remove all duplicate logger instantiations
- [ ] Use dependency injection for services (enables testing)
- [ ] Update all tests to inject mock logger
- [ ] Verify log output consistency across all plugin operations

**Priority**: Low (refactoring, fix during next plugin system iteration)

---

### Issue #5: Unimplemented Version Check (Dependency Compatibility)

**Severity**: WARNING (Medium Risk)  
**File**: `apps/core-api/src/services/plugin.service.ts:840-855`  
**Method**: `validateDependencies()`

**Description**:
The dependency version checking is marked as TODO and not implemented. This means incompatible plugin dependencies can be installed, potentially breaking the plugin system.

**Current Code**:

```typescript
private async validateDependencies(manifest: PluginManifest): Promise<void> {
  if (!manifest.dependencies) {
    return;
  }

  for (const dep of manifest.dependencies.plugins || []) {
    const depPlugin = await db.plugin.findUnique({
      where: { id: dep.id },
    });

    if (!depPlugin) {
      throw new Error(`Dependency plugin '${dep.id}' not found`);
    }

    // TODO: Check version compatibility
    // ⚠️ Currently only checks existence, not version
  }
}
```

**Vulnerability**:

- Plugin A requires Plugin B ^1.0.0
- Tenant has Plugin B 2.0.0 installed (breaking changes)
- Plugin A is installed successfully but breaks at runtime
- No error message until plugin execution fails

**Impact**:

- Runtime errors when incompatible plugins interact
- Poor user experience (plugin installs but doesn't work)
- Difficult to debug (error happens after installation)
- Potential data corruption if plugins have incompatible schemas

**Recommended Fix**:

```typescript
import semver from 'semver';

private async validateDependencies(manifest: PluginManifest): Promise<void> {
  if (!manifest.dependencies) {
    return;
  }

  for (const dep of manifest.dependencies.plugins || []) {
    const depPlugin = await db.plugin.findUnique({
      where: { id: dep.id },
      select: { id: true, version: true, manifest: true },
    });

    if (!depPlugin) {
      throw new Error(
        `Dependency not found: Plugin '${dep.id}' is required but not installed. ` +
        `Required version: ${dep.version}`
      );
    }

    // ✅ Check version compatibility using semver
    const depVersion = (depPlugin.manifest as PluginManifest).version || depPlugin.version;
    if (!semver.satisfies(depVersion, dep.version)) {
      throw new Error(
        `Incompatible dependency version: Plugin '${dep.id}' version ${depVersion} ` +
        `does not satisfy required version ${dep.version}`
      );
    }
  }

  // Also check API dependencies
  for (const apiDep of manifest.dependencies.api || []) {
    const coreApiVersion = process.env.CORE_API_VERSION || '1.0.0';
    if (!semver.satisfies(coreApiVersion, apiDep.version)) {
      throw new Error(
        `Incompatible API version: This plugin requires core-api ${apiDep.version}, ` +
        `but current version is ${coreApiVersion}`
      );
    }
  }
}
```

**Acceptance Criteria**:

- [ ] Install `semver` library (`pnpm add semver`)
- [ ] Implement version compatibility check using semver
- [ ] Add tests for version mismatch scenarios
- [ ] Update error messages to be actionable (specify which version is needed)
- [ ] Document versioning requirements in `docs/PLUGIN_DEVELOPMENT.md`

**Priority**: Medium (fix before allowing plugin dependencies in production)

---

## INFO Issue

### Issue #6: Non-Compliant Logging (Constitution Violation)

**Severity**: INFO (Low Risk, Code Quality Issue)  
**File**: `apps/core-api/src/services/plugin.service.ts:38-41, 107, 548`  
**Impact**: Observability, debugging difficulty

**Description**:
Several log statements use `console.log()` instead of structured Pino logging, violating Constitution Article 6.3 (Logging Standards).

**Current Code Examples**:

```typescript
// Line 38-41
console.log('[PluginService] Initialized', {
  registryConnected: !!this.pluginRegistry,
  eventBusConnected: !!this.eventBus,
});

// Line 107
console.log('Plugin registered successfully:', plugin.id);

// Line 548
console.log('[PluginService] Installing plugin', { pluginId, tenantId });
```

**Constitution Violation**:

> **Article 6.3**: Pino JSON Logging - Structured JSON logging with Pino (current implementation)

**Issues**:

- Logs are not parseable by centralized logging platform (e.g., ELK, Datadog)
- Missing structured fields: `timestamp`, `level`, `requestId`, `userId`, `tenantId`
- Cannot filter or search logs efficiently
- No correlation between related log entries

**Recommended Fix**:

```typescript
// Replace console.log with structured Pino logging
this.logger.info(
  {
    event: 'plugin_registered',
    pluginId: plugin.id,
    pluginName: plugin.name,
    version: manifest.version,
  },
  'Plugin registered successfully'
);

this.logger.info(
  {
    event: 'plugin_installation_started',
    pluginId,
    tenantId,
    requestId: context.requestId, // From request context
  },
  'Installing plugin'
);
```

**Acceptance Criteria**:

- [ ] Replace all `console.log()` calls with `logger.info()` / `logger.debug()`
- [ ] Add required structured fields per Constitution Article 6.3
- [ ] Ensure sensitive data (passwords, tokens) never logged
- [ ] Update logging documentation in `AGENTS.md`

**Priority**: Low (code quality, fix during refactoring)

---

## Summary

| Issue # | Title                       | Severity | Priority | Estimated Effort |
| ------- | --------------------------- | -------- | -------- | ---------------- |
| 1       | ReDoS vulnerability         | WARNING  | Medium   | 2-3 hours        |
| 2       | Unbounded query (memory)    | WARNING  | Medium   | 1-2 hours        |
| 3       | Duplicate validation logic  | WARNING  | Medium   | 2-3 hours        |
| 4       | Code duplication (logger)   | WARNING  | Low      | 3-4 hours        |
| 5       | Unimplemented version check | WARNING  | Medium   | 2-3 hours        |
| 6       | Non-compliant logging       | INFO     | Low      | 1-2 hours        |

**Total Estimated Effort**: 5-8 hours remaining (Issues #1, #4, #5 only; Issues #2, #3, #6 fixed)

---

## Test Coverage

**New Tests Added** (February 14, 2026):

- **File**: `apps/core-api/src/__tests__/plugin/unit/plugin-security-fixes.test.ts`
- **Test Count**: 11 comprehensive tests
  - 2 tests for Issue #2 (COUNT aggregation performance)
  - 3 tests for Issue #3 (Zod + custom validation enforcement)
  - 3 tests for Issue #6 (Pino logger integration)
  - 3 tests for Constitution compliance verification

**Overall Test Status**: 825/825 tests passing (814 existing + 11 new)

---

## Tracking

**FIXED (GitHub issues not needed)**:

- ~~Issue #2: Unbounded Query~~ ✅ Fixed Feb 14, 2026
- ~~Issue #3: Validation Bypass~~ ✅ Fixed Feb 14, 2026
- ~~Issue #6: Non-compliant Logging~~ ✅ Fixed Feb 14, 2026

**Remaining issues** should be created as GitHub Issues with labels:

- `security` (Issues #1)
- `technical-debt` (Issues #4, #5)
- `plugin-system` (All remaining issues)

**Recommended Sprint**: Sprint 2 (after Milestone 5/6 complete)

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
_Status: 3 issues fixed; 3 issues awaiting GitHub issue creation_
