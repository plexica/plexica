# Deprecated Documentation Archive

This directory contains deprecated documentation that is no longer actively maintained but is kept for historical reference and compliance purposes.

## About Deprecated Documents

Deprecated documents are those that:

- Have been superseded by newer documentation
- Describe features or processes that are no longer in use
- Contain outdated architectural decisions
- Reference obsolete versions of the platform

## Deprecation Policy

Documents follow a 5-step deprecation process:

1. **Announce** (Week 1)
   - Mark document with `Status: Deprecated`
   - Add deprecation notice pointing to replacement document
   - Add to upcoming archive timeline

2. **Wait** (Weeks 2-4)
   - Document remains in original location
   - Users have time to migrate to new documentation
   - Clear notice about upcoming archival

3. **Archive** (After 4 weeks)
   - Move document to this `/deprecated/` directory
   - Update all cross-references
   - Update README in original location

4. **Maintain** (3 months)
   - Keep document readable and searchable
   - Don't delete or heavily modify
   - Maintain links in this archive

5. **Archive Cleanup** (3+ months)
   - Document remains indefinitely but marked as archived
   - May be removed after 6+ months with team consensus

## Currently Archived Documents

### Superseded by Better Documentation

- `DEVELOPMENT_PLAN_OLD.md` - Superseded by MILESTONES.md
  - Archived: February 2025
  - Reason: Development milestones now tracked in MILESTONES.md
  - Migration Path: See planning/MILESTONES.md

### Historical Reference Only

_(No documents currently in this category)_

## How to Reference Deprecated Documents

If you need to reference a deprecated document, use the full path:

```markdown
[Old Development Plan](./.github/docs/deprecated/DEVELOPMENT_PLAN_OLD.md)
```

Note: Links from current documentation should NOT point to archived documents. If you find such links, they should be updated to point to the replacement document instead.

## Adding to This Archive

To archive a document:

1. Move the file to this directory
2. Update its metadata: `Status: Archived (Deprecated YYYY-MM-DD)`
3. Add an entry to this README explaining why
4. Update any cross-references in active documentation
5. Commit with message: "Archive: Move [filename] to deprecated directory"

## Related Resources

- [Documentation Management Guidelines](../AGENTS.md#documentation-management) - Complete deprecation process
- [Documentation Management Checklist](../docs/TEMPLATE_CHECKLIST.md) - Validation steps
- [Main Documentation Index](../../docs/README.md) - Current active documentation

---

**Last Updated**: 2025-02-03  
**Maintained By**: Engineering Team
