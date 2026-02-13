# Decision Log

> This document tracks architectural decisions, technical debt, deferred
> decisions, and implementation notes that don't warrant a full ADR.

**Last Updated**: February 13, 2026

---

## Active Decisions

### Technical Debt

| ID     | Description                                              | Impact  | Severity | Tracked In                                | Target Sprint |
| ------ | -------------------------------------------------------- | ------- | -------- | ----------------------------------------- | ------------- |
| TD-001 | Test coverage at 63%, target 80%                         | Quality | MEDIUM   | `specs/TEST_COVERAGE_IMPROVEMENT_PLAN.md` | Phase 2       |
| TD-002 | Core modules (auth, tenant, workspace) need 85% coverage | Quality | HIGH     | `AGENTS.md`                               | Q1 2026       |

### Deferred Decisions

| ID     | Decision                             | Reason Deferred                          | Revisit Date | Context               |
| ------ | ------------------------------------ | ---------------------------------------- | ------------ | --------------------- |
| DD-001 | GraphQL API layer                    | Focus on REST first; evaluate after v1.0 | Q2 2026      | Plugin API evolution  |
| DD-002 | Real-time collaboration (WebSockets) | Core platform stability priority         | Q2 2026      | Future plugin feature |

---

## Implementation Notes

### Microservices Architecture

**Date**: February 13, 2026  
**Context**: Constitution Article 3.1 defines architecture as Microservices

**Current State**:

- Core API is a modular monolith with clear module boundaries
- Plugin system supports both:
  - **Embedded plugins**: Loaded as modules within core-api process
  - **Remote plugins**: Deployed as separate microservices

**Migration Strategy**:

- Phase 1 (Current): Modular monolith with plugin system
- Phase 2 (Q2 2026): Extract plugins as independent microservices
- Phase 3 (Q3 2026): Core platform service decomposition if needed

**Rationale**:

- Start with modular monolith for development velocity
- Service registry pattern already in place for future microservices
- Plugin isolation and API contracts enable gradual extraction

**Related ADRs**:

- [ADR-001: Monorepo Strategy](adr/adr-001-monorepo-strategy.md)
- [ADR-002: Database Multi-Tenancy](adr/adr-002-database-multi-tenancy.md)
- [ADR-005: Event System (Redpanda)](adr/adr-005-event-system-redpanda.md)
- [ADR-006: Fastify Framework](adr/adr-006-fastify-framework.md)
- [ADR-007: Prisma ORM](adr/adr-007-prisma-orm.md)
- See [ADR Index](adr/README.md) for all 11 ADRs

---

## Recent Changes

| Date       | Change                            | Reason                                                           | Impact                                                                 |
| ---------- | --------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 2026-02-13 | FORGE documentation conversion    | Convert all docs/specs/planning to FORGE format                  | High - All documentation centralized under .forge/                     |
| 2026-02-13 | 11 ADRs created in FORGE format   | Migrate from planning/DECISIONS.md to individual ADR files       | Medium - Better navigability and cross-referencing                     |
| 2026-02-13 | 8 modular specs created           | Break monolithic FUNCTIONAL_SPECIFICATIONS.md into modular specs | High - Specs are now traceable and independently maintainable          |
| 2026-02-13 | Architecture docs created         | Synthesize system, deployment, and security architecture docs    | High - Architecture decisions are now documented with Mermaid diagrams |
| 2026-02-13 | Product brief and roadmap created | Extract from functional specs into FORGE product docs            | Medium - Product vision and roadmap centralized                        |
| 2026-02-13 | FORGE methodology initialized     | Improve structured development workflow                          | High - All future work follows FORGE                                   |
| 2026-02-13 | Constitution created (v1.0)       | Define non-negotiable project standards                          | High - Governs all development decisions                               |

---

## Questions & Clarifications

<!-- Use this section to track open questions that need resolution -->

No open questions currently.

---

_This document is living and should be updated as decisions are made or
deferred. For significant architectural decisions, create a full ADR using
`/forge-adr`._
