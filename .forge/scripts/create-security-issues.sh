#!/bin/bash
# GitHub Issue Creation Script
# 
# This script creates GitHub issues for the WARNING-level security and technical debt
# items found during the Milestone 4 code review.
#
# Prerequisites:
#   - GitHub CLI installed: https://cli.github.com/
#   - Authenticated: gh auth login
#
# Usage:
#   chmod +x create-security-issues.sh
#   ./create-security-issues.sh

set -e

REPO="plexica/plexica"

echo "🔍 Creating security and technical debt issues for $REPO..."
echo ""

# Issue #1: ReDoS Vulnerability
echo "📝 Creating Issue #1: ReDoS vulnerability..."
gh issue create \
  --repo "$REPO" \
  --title "[Security] ReDoS vulnerability in plugin manifest validation" \
  --label "security,plugin-system,technical-debt" \
  --body "## Summary

The plugin manifest validation uses a simple regex timeout mechanism that can be bypassed with carefully crafted patterns, potentially leading to Regular Expression Denial of Service (ReDoS) attacks.

## Location

**File**: \`apps/core-api/src/services/plugin.service.ts\`  
**Lines**: 891-913 (method \`validateRegexSafety()\`)

## Issue Details

### Current Implementation

\`\`\`typescript
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
\`\`\`

### Vulnerability

- Malicious plugin authors can craft regex patterns that cause CPU exhaustion
- The timeout mechanism doesn't interrupt the RegExp constructor execution
- No protection against catastrophic backtracking patterns

### Impact

- **Severity**: WARNING
- **Risk**: Medium-High
- **Attack Vector**: Malicious plugin manifest with crafted regex patterns
- **Consequence**: Server CPU exhaustion, DoS for all tenants

## Recommended Fix

Use \`safe-regex2\` library or execute regex validation in a worker thread with proper timeout.

See \`.forge/knowledge/security-warnings.md\` (Issue #1) for detailed implementation.

## References

- Found by: \`/forge-review\` (Milestone 4 adversarial code review, Feb 14 2026)
- Related: OWASP ReDoS prevention guidelines
- Constitution: Article 5 (Security)

## Acceptance Criteria

- [ ] Replace timeout-based validation with \`safe-regex2\` library
- [ ] Add test cases for known ReDoS patterns
- [ ] Update plugin validation error messages
- [ ] Document regex safety requirements in \`PLUGIN_TRANSLATIONS.md\`

## Priority

**Medium** - Should be fixed before production deployment

---

**Estimated Effort**: 2-3 hours"

echo "✅ Issue #1 created"
echo ""

# Issue #2: Unbounded Query
echo "📝 Creating Issue #2: Unbounded query in getPluginStats..."
gh issue create \
  --repo "$REPO" \
  --title "[Performance] Unbounded query causing memory exhaustion in getPluginStats" \
  --label "performance,plugin-system,technical-debt" \
  --body "## Summary

The \`getPluginStats()\` method loads ALL plugin installations into memory to count them, which can cause memory exhaustion for popular plugins with thousands of tenants.

## Location

**File**: \`apps/core-api/src/services/plugin.service.ts\`  
**Lines**: 263-292 (method \`getPluginStats()\`)

## Issue Details

### Current Implementation

\`\`\`typescript
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
\`\`\`

### Vulnerability

- For popular plugins with 10,000+ tenants, this loads megabytes of data into memory
- Can cause Node.js out-of-memory errors
- Scales linearly with adoption (O(n) memory usage)

### Impact

- **Severity**: WARNING
- **Risk**: Medium
- **Attack Vector**: Repeatedly calling stats endpoint for popular plugins
- **Consequence**: Server crashes, degraded performance

## Recommended Fix

Replace with database aggregation queries using \`db.tenantPlugin.count()\`.

See \`.forge/knowledge/security-warnings.md\` (Issue #2) for detailed implementation.

## References

- Found by: \`/forge-review\` (Milestone 4 adversarial code review, Feb 14 2026)
- Constitution: Article 4.3 (Performance Targets)

## Acceptance Criteria

- [ ] Replace \`include: { installations: true }\` with aggregation queries
- [ ] Add performance test with 10,000+ mock installations
- [ ] Verify memory usage stays under 50MB even for popular plugins
- [ ] Update API documentation with performance characteristics

## Priority

**Medium** - Should be fixed before scaling to production traffic

---

**Estimated Effort**: 1-2 hours"

echo "✅ Issue #2 created"
echo ""

# Issue #3: Duplicate Validation Logic
echo "📝 Creating Issue #3: Duplicate validation logic..."
gh issue create \
  --repo "$REPO" \
  --title "[Security] Inconsistent validation in updatePlugin (bypasses Zod)" \
  --label "security,plugin-system,technical-debt" \
  --body "## Summary

The \`updatePlugin()\` method bypasses Zod validation entirely, while \`registerPlugin()\` enforces strict validation. This creates inconsistent behavior and potential security bypass.

## Location

**File**: \`apps/core-api/src/services/plugin.service.ts\`  
**Lines**: 55-62 (registerPlugin), 131-132 (updatePlugin)

## Issue Details

### Current Implementation

**registerPlugin()**: ✅ Enforces Zod validation  
**updatePlugin()**: ❌ NO validation - direct database update

\`\`\`typescript
async updatePlugin(pluginId: string, updates: Partial<PluginManifest>): Promise<Plugin> {
  // ❌ NO Zod validation - direct database update
  return await db.plugin.update({
    where: { id: pluginId },
    data: { manifest: updates as Prisma.JsonValue },
  });
}
\`\`\`

### Vulnerability

- Plugin authors can bypass validation by using \`updatePlugin()\` instead of \`registerPlugin()\`
- Invalid manifest data can be persisted to database
- Security constraints (translation file validation, API schema) can be bypassed

### Impact

- **Severity**: WARNING
- **Risk**: Medium
- **Attack Vector**: Update plugin manifest to bypass file size checks or validation rules
- **Consequence**: Data corruption, security bypass

## Recommended Fix

Consolidate validation logic and apply Zod schema to both methods.

See \`.forge/knowledge/security-warnings.md\` (Issue #3) for detailed implementation.

## References

- Found by: \`/forge-review\` (Milestone 4 adversarial code review, Feb 14 2026)
- Constitution: Article 5.3 (Input Validation)

## Acceptance Criteria

- [ ] Consolidate validation logic into shared method \`validatePluginManifest()\`
- [ ] Apply Zod validation to both \`registerPlugin()\` and \`updatePlugin()\`
- [ ] Add integration test: register valid plugin → update with invalid data → verify rejection
- [ ] Document validation requirements in API docs

## Priority

**Medium** - Should be fixed before allowing plugin updates in production

---

**Estimated Effort**: 2-3 hours"

echo "✅ Issue #3 created"
echo ""

# Issue #4: Code Duplication
echo "📝 Creating Issue #4: Code duplication (logger)..."
gh issue create \
  --repo "$REPO" \
  --title "[Refactor] Code duplication in logger and service instantiation" \
  --label "refactoring,plugin-system,technical-debt" \
  --body "## Summary

Logger instances and service dependencies are instantiated multiple times throughout the service, leading to maintenance burden and inconsistent behavior.

## Location

**File**: \`apps/core-api/src/services/plugin.service.ts\`  
**Lines**: 29-48 (constructor), 415-431 (installPlugin method)

## Issue Details

### Current Implementation

Logger configuration is duplicated across multiple locations:

\`\`\`typescript
// Constructor
constructor() {
  this.logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    // ... configuration repeated
  });
}

// installPlugin method
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // ... same configuration again
});
\`\`\`

### Maintenance Issues

- Changes to logger configuration must be replicated across multiple locations
- Risk of inconsistent log formats or levels
- Harder to mock for testing
- Violates DRY (Don't Repeat Yourself) principle

## Recommended Fix

Create a logger factory and use dependency injection.

See \`.forge/knowledge/security-warnings.md\` (Issue #4) for detailed implementation.

## References

- Found by: \`/forge-review\` (Milestone 4 adversarial code review, Feb 14 2026)
- Constitution: Article 6.3 (Logging Standards)

## Acceptance Criteria

- [ ] Extract logger factory to \`src/lib/logger.ts\`
- [ ] Remove all duplicate logger instantiations
- [ ] Use dependency injection for services (enables testing)
- [ ] Update all tests to inject mock logger
- [ ] Verify log output consistency across all plugin operations

## Priority

**Low** - Refactoring, fix during next plugin system iteration

---

**Estimated Effort**: 3-4 hours"

echo "✅ Issue #4 created"
echo ""

# Issue #5: Unimplemented Version Check
echo "📝 Creating Issue #5: Unimplemented version check..."
gh issue create \
  --repo "$REPO" \
  --title "[Bug] Unimplemented dependency version checking" \
  --label "bug,plugin-system,technical-debt" \
  --body "## Summary

The dependency version checking is marked as TODO and not implemented. This means incompatible plugin dependencies can be installed, potentially breaking the plugin system.

## Location

**File**: \`apps/core-api/src/services/plugin.service.ts\`  
**Lines**: 840-855 (method \`validateDependencies()\`)

## Issue Details

### Current Implementation

\`\`\`typescript
private async validateDependencies(manifest: PluginManifest): Promise<void> {
  if (!manifest.dependencies) {
    return;
  }

  for (const dep of manifest.dependencies.plugins || []) {
    const depPlugin = await db.plugin.findUnique({
      where: { id: dep.id },
    });

    if (!depPlugin) {
      throw new Error(\`Dependency plugin '\${dep.id}' not found\`);
    }

    // TODO: Check version compatibility
    // ⚠️ Currently only checks existence, not version
  }
}
\`\`\`

### Vulnerability

- Plugin A requires Plugin B ^1.0.0
- Tenant has Plugin B 2.0.0 installed (breaking changes)
- Plugin A is installed successfully but breaks at runtime

### Impact

- **Severity**: WARNING
- **Risk**: Medium
- **Consequence**: Runtime errors, poor UX, potential data corruption

## Recommended Fix

Implement semver version compatibility checking.

See \`.forge/knowledge/security-warnings.md\` (Issue #5) for detailed implementation.

## References

- Found by: \`/forge-review\` (Milestone 4 adversarial code review, Feb 14 2026)
- Related: npm semver specification

## Acceptance Criteria

- [ ] Install \`semver\` library (\`pnpm add semver\`)
- [ ] Implement version compatibility check using semver
- [ ] Add tests for version mismatch scenarios
- [ ] Update error messages to be actionable
- [ ] Document versioning requirements in \`docs/PLUGIN_DEVELOPMENT.md\`

## Priority

**Medium** - Should be fixed before allowing plugin dependencies in production

---

**Estimated Effort**: 2-3 hours"

echo "✅ Issue #5 created"
echo ""

# Issue #6: Non-Compliant Logging
echo "📝 Creating Issue #6: Non-compliant logging..."
gh issue create \
  --repo "$REPO" \
  --title "[Code Quality] Replace console.log with structured Pino logging" \
  --label "code-quality,constitution-compliance,plugin-system" \
  --body "## Summary

Several log statements use \`console.log()\` instead of structured Pino logging, violating Constitution Article 6.3 (Logging Standards).

## Location

**File**: \`apps/core-api/src/services/plugin.service.ts\`  
**Lines**: 38-41, 107, 548

## Issue Details

### Current Implementation

\`\`\`typescript
// Line 38-41
console.log('[PluginService] Initialized', {
  registryConnected: !!this.pluginRegistry,
  eventBusConnected: !!this.eventBus,
});

// Line 107
console.log('Plugin registered successfully:', plugin.id);

// Line 548
console.log('[PluginService] Installing plugin', { pluginId, tenantId });
\`\`\`

### Constitution Violation

> **Article 6.3**: Pino JSON Logging - Structured JSON logging with Pino (current implementation)

### Issues

- Logs are not parseable by centralized logging platform
- Missing structured fields: \`timestamp\`, \`level\`, \`requestId\`, \`userId\`, \`tenantId\`
- Cannot filter or search logs efficiently
- No correlation between related log entries

## Recommended Fix

Replace all \`console.log()\` calls with structured Pino logging.

See \`.forge/knowledge/security-warnings.md\` (Issue #6) for detailed implementation.

## References

- Found by: \`/forge-review\` (Milestone 4 adversarial code review, Feb 14 2026)
- Constitution: Article 6.3 (Logging Standards)

## Acceptance Criteria

- [ ] Replace all \`console.log()\` calls with \`logger.info()\` / \`logger.debug()\`
- [ ] Add required structured fields per Constitution Article 6.3
- [ ] Ensure sensitive data (passwords, tokens) never logged
- [ ] Update logging documentation in \`AGENTS.md\`

## Priority

**Low** - Code quality, fix during refactoring

---

**Estimated Effort**: 1-2 hours"

echo "✅ Issue #6 created"
echo ""

echo "🎉 All 6 issues created successfully!"
echo ""
echo "📊 Summary:"
echo "  - 3 Security issues (ReDoS, unbounded query, duplicate validation)"
echo "  - 1 Performance issue (memory exhaustion)"
echo "  - 1 Bug (unimplemented version check)"
echo "  - 1 Code quality issue (logging compliance)"
echo ""
echo "📈 Total estimated effort: 11-17 hours (2-3 days)"
echo ""
echo "View issues: https://github.com/$REPO/issues"
