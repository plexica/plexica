# How to Use Documentation Templates

This guide explains how to use the three documentation templates available in `.github/docs/` to maintain consistency across the Plexica project.

## Quick Reference

| Template                                                                     | Use For                                 | Location                | File Format                        |
| ---------------------------------------------------------------------------- | --------------------------------------- | ----------------------- | ---------------------------------- |
| [TEMPLATE_TECHNICAL_SPECIFICATION.md](./TEMPLATE_TECHNICAL_SPECIFICATION.md) | System design, architecture, tech specs | `specs/` directory      | Add to TECHNICAL_SPECIFICATIONS.md |
| [TEMPLATE_ARCHITECTURAL_DECISION.md](./TEMPLATE_ARCHITECTURAL_DECISION.md)   | Major architectural decisions           | `planning/DECISIONS.md` | Add to DECISIONS.md as new ADR     |
| [TEMPLATE_DEVELOPER_GUIDE.md](./TEMPLATE_DEVELOPER_GUIDE.md)                 | Setup guides, tutorials, how-to docs    | `docs/` directory       | Create new `.md` file in docs/     |

## Step-by-Step Usage

### 1. Technical Specification Template

**When to use**: You're documenting a new system component, major architectural change, or technical implementation.

**How to use**:

1. Open [TEMPLATE_TECHNICAL_SPECIFICATION.md](./TEMPLATE_TECHNICAL_SPECIFICATION.md)
2. Copy the template content (between the triple backticks)
3. Open or create `specs/TECHNICAL_SPECIFICATIONS.md`
4. Add a new section with the template content
5. Fill in:
   - `[Feature/Component Name]` → Your component name
   - `YYYY-MM-DD` → Today's date (ISO 8601)
   - Replace all `[placeholder]` sections with your content
6. Remove any sections that don't apply to your component
7. Include working code examples with file paths
8. Add links to related ADRs and other documentation

**Example**: Documenting a new "Notification Service"

```markdown
# Plexica - Notification Service Specifications

**Last Updated**: 2025-02-03  
**Status**: Draft  
**Owner**: Backend Team  
**Related ADRs**: ADR-015 (Event-Driven Architecture)

## Overview

The Notification Service handles delivery of notifications across multiple channels...
```

### 2. Architectural Decision Record (ADR) Template

**When to use**: Your team made a significant decision about architecture, technology choices, or major design patterns.

**How to use**:

1. Open [TEMPLATE_ARCHITECTURAL_DECISION.md](./TEMPLATE_ARCHITECTURAL_DECISION.md)
2. Find the next available ADR number in `planning/DECISIONS.md` (increment from last ADR)
3. Copy the template content
4. Add a new section in `planning/DECISIONS.md` with:
   - `## ADR-XXX:` where XXX is the next number
   - Fill in all template sections
   - Most important: Context (why), Decision (what), Consequences (impact)
5. Include code examples showing how the decision manifests
6. Link related ADRs and decisions
7. After team review, change Status to "Accepted"

**Example**: ADR for choosing PostgreSQL schema-per-tenant strategy

```markdown
## ADR-012: Multi-Tenant Database Strategy - Schema Per Tenant

**Date**: 2025-02-03  
**Status**: Accepted  
**Deciders**: Luca Forni, Backend Team  
**Tags**: #architecture #database #multi-tenancy

### Context

We need to isolate data between tenants while maintaining query performance...

### Decision

We will use PostgreSQL with schema-per-tenant isolation...

### Consequences

#### Positive

- Complete data isolation between tenants
- Simple query logic (no tenant filtering needed)

#### Negative

- More complex schema management
- More connections needed per tenant
```

### 3. Developer Guide Template

**When to use**: Creating documentation for developers on how to set up, use, or implement a feature.

**How to use**:

1. Open [TEMPLATE_DEVELOPER_GUIDE.md](./TEMPLATE_DEVELOPER_GUIDE.md)
2. Create a new file in `docs/` directory (e.g., `docs/FEATURE_GUIDE.md`)
3. Copy the template content
4. Customize the metadata:
   - Title: `# [Feature/Component Name] Developer Guide`
   - Last Updated: Today's date
   - Status: Draft | Complete | Needs Review
   - Audience: Who this is for
   - Prerequisites: What they need to know
5. Fill in each section:
   - **Quick Start**: Make it copy-paste ready (5 minutes max)
   - **How It Works**: Explain the system with diagrams
   - **Common Tasks**: Step-by-step instructions
   - **Troubleshooting**: Real error messages and solutions
6. Test all commands before publishing
7. Remove sections that don't apply

**Example**: Developer guide for workspace management

````markdown
# Workspace Management Developer Guide

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Audience**: Backend developers  
**Prerequisites**: Node.js 20+, Docker, PostgreSQL  
**Time to Complete**: 20 minutes

## Quick Start

```bash
# 1. Setup local database
pnpm db:migrate

# 2. Create test workspace
curl -X POST http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Workspace", "slug": "my-workspace"}'

# 3. Verify it worked
curl http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer $TOKEN"
```
````

```

## Common Mistakes When Using Templates

❌ **Don't**:
- Copy template and submit without filling in placeholders
- Keep sections that don't apply to your document
- Use `[placeholder]` in final document
- Forget to update Last Updated date
- Include broken code examples
- Skip the metadata section
- Create a new template when one exists

✅ **Do**:
- Read the "Notes for Using This Template" section in each template
- Customize the template to your needs
- Test all code examples before publishing
- Keep metadata current (Date, Status, Author)
- Link to related documentation
- Have your document reviewed before publishing
- Update the template if you find something missing or unclear

## Validating Your Documentation

Before submitting, check:

- ✅ All placeholders (`[...]`) have been replaced
- ✅ Metadata (Date, Status) is filled in correctly
- ✅ Code examples are tested and working
- ✅ File paths in code examples include comments
- ✅ Language identifiers on code blocks (typescript, bash, etc.)
- ✅ Internal links use relative paths and work
- ✅ Related documents are linked in "See Also" or similar section
- ✅ No broken Markdown syntax
- ✅ Table of Contents (if included) matches actual structure
- ✅ Tone is consistent and appropriate for audience

## Extending the Templates

If you find the templates are missing something:

1. **Update the template** in `.github/docs/`
2. **Document why** you added the new section
3. **Update this guide** to mention the change
4. **Notify the team** so others use the updated template

Example notification: "Updated TEMPLATE_DEVELOPER_GUIDE.md - added Configuration Options section for better consistency"

## Questions?

- Read the specific template's "Notes for Using This Template" section
- Check existing documentation in `specs/`, `docs/`, `planning/` for examples
- Review the examples in [AGENTS.md - Documentation Management](../AGENTS.md#documentation-templates)
- Ask in GitHub Discussions if you need clarification

---

**Last Updated**: 2025-02-03
**Version**: 1.0
```
