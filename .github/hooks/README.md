# Git Hooks for Documentation Management

This directory contains custom git hooks to ensure documentation quality and consistency.

## Available Hooks

### pre-commit

**Purpose**: Validates documentation metadata before commits

**What it checks**:

- All markdown files in `docs/`, `specs/`, `planning/`, `.github/docs/` directories have required metadata
- Required fields:
  - `**Last Updated**`: YYYY-MM-DD format
  - `**Status**`: One of: Complete, In Progress, Planned, Deprecated, Archived, Needs Update
  - `**Owner**`: Team or person responsible
  - `**Document Type**`: e.g., "Technical Specifications", "Developer Guide", "Planning"
- Warns if documentation is older than 6 months
- Validates Status values against allowed values

**Excluded files**:

- README.md files (index/overview files)
- Files outside documentation directories

## Installation

To install the pre-commit hook, run:

```bash
cd /path/to/plexica
ln -s ../../.github/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Or use a hook installer if available in the project.

## Running Hooks Manually

You can run the hooks manually without committing:

```bash
# Validate documentation metadata
python3 .github/hooks/validate-doc-metadata.py

# Validate documentation links
python3 .github/scripts/validate-doc-links.py
```

## Bypassing Hooks

If you need to skip the hook for a commit (not recommended):

```bash
git commit --no-verify
```

However, you should fix the documentation issues before pushing to remote.

## Related Documentation

- [Documentation Management Guidelines](../AGENTS.md#documentation-management)
- [Link Validation Script](./../scripts/validate-doc-links.py)
- [Documentation Structure](../../docs/README.md)

## Adding New Hooks

To add new hooks:

1. Create the hook script in this directory
2. Make it executable: `chmod +x hook-name`
3. Link it from `.git/hooks/`
4. Document it in this README

---

**Last Updated**: 2025-02-03  
**Maintained By**: Engineering Team
