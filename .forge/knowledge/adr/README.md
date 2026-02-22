# Architectural Decision Records (ADRs)

This directory contains Architectural Decision Records (ADRs) for Plexica. ADRs document significant architectural and technical decisions, their context, and their consequences.

## What is an ADR?

An ADR captures an important architectural decision made during the project, including:

- **Context**: Why was this decision needed?
- **Decision**: What did we decide to do?
- **Consequences**: What are the trade-offs and implications?
- **Status**: Accepted, Deprecated, Superseded

## When to Create an ADR

Create an ADR using `/forge-adr` when:

- Making significant technology choices (new framework, database, library)
- Defining system architecture patterns or boundaries
- Changing the technology stack (requires constitutional amendment)
- Resolving complex technical design questions
- Making trade-offs with long-term implications

**Do NOT create an ADR for**:

- Routine implementation details
- Bug fixes or minor refactors
- Decisions that are easily reversible

## ADR Naming Convention

ADRs are numbered sequentially:

```
adr-001-monorepo-strategy.md
adr-002-database-multi-tenancy.md
adr-003-plugin-language-support.md
```

## ADR Template

Use `/forge-adr <decision-topic>` to create a new ADR. The template includes:

```markdown
# ADR-XXX: [Decision Title]

**Date**: YYYY-MM-DD  
**Status**: [Proposed | Accepted | Deprecated | Superseded by ADR-YYY]  
**Deciders**: [Names or roles]  
**Context**: [Brief summary]

## Context and Problem Statement

[Describe the context and problem requiring a decision]

## Decision Drivers

- [Driver 1]
- [Driver 2]
- [Driver 3]

## Considered Options

1. **Option 1**: [Description]
2. **Option 2**: [Description]
3. **Option 3**: [Description]

## Decision Outcome

**Chosen option**: [Option X] - [Brief rationale]

### Positive Consequences

- [Benefit 1]
- [Benefit 2]

### Negative Consequences

- [Trade-off 1]
- [Trade-off 2]

## Implementation Notes

[How this decision will be implemented]

## Related Decisions

- [ADR-XXX]: [Related decision]
- Constitution Article X.Y: [Related constraint]

## References

- [Link to relevant documentation]
- [Link to discussion or RFC]
```

## ADR Index

| ID      | Title                                                                           | Status   | Date       | Related To                               |
| ------- | ------------------------------------------------------------------------------- | -------- | ---------- | ---------------------------------------- |
| ADR-001 | [Monorepo Strategy (Turborepo + pnpm)](adr-001-monorepo-strategy.md)            | Accepted | 2025-01-13 | Constitution Art. 2.1                    |
| ADR-002 | [Database Multi-Tenancy (Schema-per-Tenant)](adr-002-database-multi-tenancy.md) | Accepted | 2025-01-13 | Constitution Art. 1.2, 5.2               |
| ADR-003 | [Plugin Language Support (TypeScript Only)](adr-003-plugin-language-support.md) | Accepted | 2025-01-13 | Constitution Art. 2.1                    |
| ADR-004 | [Frontend Module Federation](adr-004-module-federation.md)                      | Accepted | 2025-01-13 | ADR-011, Constitution Art. 2.1           |
| ADR-005 | [Event System (Redpanda)](adr-005-event-system-redpanda.md)                     | Accepted | 2025-01-13 | Constitution Art. 2.1                    |
| ADR-006 | [API Framework (Fastify)](adr-006-fastify-framework.md)                         | Accepted | 2025-01-13 | Constitution Art. 2.1, 3.4               |
| ADR-007 | [ORM Choice (Prisma)](adr-007-prisma-orm.md)                                    | Accepted | 2025-01-13 | ADR-002, Constitution Art. 3.3           |
| ADR-008 | [Playwright for Frontend E2E Testing](adr-008-playwright-e2e.md)                | Accepted | 2026-02-11 | Constitution Art. 4.1, 8.1               |
| ADR-009 | [TailwindCSS v4 Semantic Tokens](adr-009-tailwindcss-v4-tokens.md)              | Accepted | 2026-02-11 | ADR-004, Constitution Art. 1.3           |
| ADR-010 | [@plexica/types Shared Package](adr-010-shared-types-package.md)                | Accepted | 2026-02-11 | ADR-001, Constitution Art. 7.1           |
| ADR-011 | [Vite Module Federation for Plugins](adr-011-vite-module-federation.md)         | Accepted | 2026-02-11 | ADR-004, ADR-009, ADR-010                |
| ADR-012 | [ICU MessageFormat Library (FormatJS)](adr-012-icu-messageformat-library.md)    | Accepted | 2026-02-13 | Spec 006, Constitution Art. 2            |
| ADR-013 | [Materialised Path for Workspace Hierarchy](adr-013-materialised-path.md)       | Accepted | 2026-02-20 | Spec 011, ADR-002                        |
| ADR-014 | [WorkspacePlugin Scoping (Separate Table)](adr-014-workspace-plugin-scoping.md) | Accepted | 2026-02-20 | Spec 011, ADR-002, Constitution Art. 3.2 |

---

## Original Source

These ADRs were converted from `planning/DECISIONS.md` into individual FORGE-format documents on February 13, 2026, as part of the FORGE documentation conversion initiative.

---

_Last Updated: February 22, 2026_
