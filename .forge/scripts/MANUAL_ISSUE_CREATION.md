# Manual GitHub Issue Creation Commands

> Use these commands if you prefer to create issues one at a time or if the automated script fails.

**Prerequisites**:

- GitHub CLI installed: `brew install gh` (macOS) or see https://cli.github.com/
- Authenticated: `gh auth login`

---

## Issue #1: ReDoS Vulnerability

```bash
gh issue create \
  --repo plexica/plexica \
  --title "[Security] ReDoS vulnerability in plugin manifest validation" \
  --label "security,plugin-system,technical-debt" \
  --body-file .forge/knowledge/issue-bodies/issue-1-redos.md
```

---

## Issue #2: Unbounded Query

```bash
gh issue create \
  --repo plexica/plexica \
  --title "[Performance] Unbounded query causing memory exhaustion in getPluginStats" \
  --label "performance,plugin-system,technical-debt" \
  --body-file .forge/knowledge/issue-bodies/issue-2-unbounded-query.md
```

---

## Issue #3: Duplicate Validation Logic

```bash
gh issue create \
  --repo plexica/plexica \
  --title "[Security] Inconsistent validation in updatePlugin (bypasses Zod)" \
  --label "security,plugin-system,technical-debt" \
  --body-file .forge/knowledge/issue-bodies/issue-3-duplicate-validation.md
```

---

## Issue #4: Code Duplication

```bash
gh issue create \
  --repo plexica/plexica \
  --title "[Refactor] Code duplication in logger and service instantiation" \
  --label "refactoring,plugin-system,technical-debt" \
  --body-file .forge/knowledge/issue-bodies/issue-4-code-duplication.md
```

---

## Issue #5: Unimplemented Version Check

```bash
gh issue create \
  --repo plexica/plexica \
  --title "[Bug] Unimplemented dependency version checking" \
  --label "bug,plugin-system,technical-debt" \
  --body-file .forge/knowledge/issue-bodies/issue-5-version-check.md
```

---

## Issue #6: Non-Compliant Logging

```bash
gh issue create \
  --repo plexica/plexica \
  --title "[Code Quality] Replace console.log with structured Pino logging" \
  --label "code-quality,constitution-compliance,plugin-system" \
  --body-file .forge/knowledge/issue-bodies/issue-6-logging.md
```

---

## Alternative: Create via GitHub Web UI

If you prefer using the GitHub web interface:

1. Go to https://github.com/plexica/plexica/issues/new
2. Copy the issue title and body from `.forge/knowledge/security-warnings.md`
3. Add the appropriate labels
4. Submit

---

## Quick Summary

| #   | Title                       | Labels                                               | Priority | Effort |
| --- | --------------------------- | ---------------------------------------------------- | -------- | ------ |
| 1   | ReDoS vulnerability         | security, plugin-system, technical-debt              | Medium   | 2-3h   |
| 2   | Unbounded query             | performance, plugin-system, technical-debt           | Medium   | 1-2h   |
| 3   | Duplicate validation        | security, plugin-system, technical-debt              | Medium   | 2-3h   |
| 4   | Code duplication            | refactoring, plugin-system, technical-debt           | Low      | 3-4h   |
| 5   | Unimplemented version check | bug, plugin-system, technical-debt                   | Medium   | 2-3h   |
| 6   | Non-compliant logging       | code-quality, constitution-compliance, plugin-system | Low      | 1-2h   |

**Total**: 11-17 hours across 6 issues

---

_Last Updated: February 14, 2026_
