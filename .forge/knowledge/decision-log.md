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

### ADR-012: ICU MessageFormat Library (FormatJS)

**Date**: 2026-02-13  
**Decision**: Selected FormatJS (`@formatjs/intl` + `react-intl`) as the ICU
MessageFormat library for Plexica's i18n system (Spec 006).  
**Rationale**: FormatJS provides native ICU MessageFormat compliance (built
by ICU-TC contributors), compile-time message compilation for optimal bundle
size (~12KB vs ~25KB for i18next+ICU), dual Node.js/browser API for shared
`@plexica/i18n` package, and strong React integration. i18next rejected due
to bolted-on ICU support, heavier bundle, and runtime parsing. LinguiJS
rejected due to smaller ecosystem and macro build complexity with Module
Federation.  
**Impact**: New dependencies (`@formatjs/intl`, `react-intl`, `@formatjs/cli`);
system architecture doc updated to FormatJS (2026-02-13); `@plexica/i18n`
shared package to be created.  
**Status**: ✅ Architecture updated; Spec 006 clarified and corrected.

---

## Recent Changes

| Date       | Change                             | Reason                                                           | Impact                                                                                    |
| ---------- | ---------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2026-02-13 | Milestone 2 (i18n) completed       | @plexica/i18n shared package created with FormatJS wrapper       | High - 8 tasks complete; 115 tests passing; 94.9% coverage; ready for backend integration |
| 2026-02-13 | Milestone 1 (i18n) completed       | Database schema and migration for i18n support implemented       | High - All 3 tasks complete; migration tested with 11 passing tests                       |
| 2026-02-13 | Spec 006 clarification (session 2) | Resolved /forge-analyze findings: data model, NFR measurability  | Medium - Fixed `tenant_settings` ref, added `default_locale`, made NFR-004/005 measurable |
| 2026-02-13 | Architecture: i18n module added    | Added i18n module to core-api structure for Spec 006             | Low - Documents future Phase 3 module                                                     |
| 2026-02-13 | Architecture: public endpoints     | Documented unauthenticated request flow pattern                  | Medium - Enables public translation/asset endpoints                                       |
| 2026-02-13 | Architecture: i18next → FormatJS   | Updated system-architecture.md per ADR-012                       | High - Aligns architecture with accepted ADR-012 decision                                 |
| 2026-02-13 | ADR-012: FormatJS for i18n         | ICU MessageFormat library selection for Spec 006-i18n            | Medium - New dependencies; system architecture doc updated                                |
| 2026-02-13 | FORGE documentation conversion     | Convert all docs/specs/planning to FORGE format                  | High - All documentation centralized under .forge/                                        |
| 2026-02-13 | 11 ADRs created in FORGE format    | Migrate from planning/DECISIONS.md to individual ADR files       | Medium - Better navigability and cross-referencing                                        |
| 2026-02-13 | 8 modular specs created            | Break monolithic FUNCTIONAL_SPECIFICATIONS.md into modular specs | High - Specs are now traceable and independently maintainable                             |
| 2026-02-13 | Architecture docs created          | Synthesize system, deployment, and security architecture docs    | High - Architecture decisions are now documented with Mermaid diagrams                    |
| 2026-02-13 | Product brief and roadmap created  | Extract from functional specs into FORGE product docs            | Medium - Product vision and roadmap centralized                                           |
| 2026-02-13 | FORGE methodology initialized      | Improve structured development workflow                          | High - All future work follows FORGE                                                      |
| 2026-02-13 | Constitution created (v1.0)        | Define non-negotiable project standards                          | High - Governs all development decisions                                                  |

---

## Questions & Clarifications

<!-- Use this section to track open questions that need resolution -->

No open questions currently.

---

_This document is living and should be updated as decisions are made or
deferred. For significant architectural decisions, create a full ADR using
`/forge-adr`._
