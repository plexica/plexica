# Decision Log Archive - 2025

> This archive contains historical decisions from 2025 and earlier that have been completed.
> For current active decisions, see [../decision-log.md](../decision-log.md)

**Archive Date**: February 17, 2026  
**Period Covered**: Project inception through December 31, 2025

---

## Implementation Notes (2025)

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

## Security Warnings Tracked (2025)

Following Milestone 4 code review (`/forge-review`), 6 security and code quality issues were identified and documented for future resolution:

- **5 WARNING issues**: ReDoS vulnerability, unbounded query, duplicate validation, code duplication, unimplemented version check
- **1 INFO issue**: Non-compliant logging (console.log vs Pino)

**Full details**: See [`.forge/knowledge/security-warnings.md`](./security-warnings.md)

**Status**: Issues documented, awaiting GitHub issue creation  
**Target Sprint**: Sprint 2 (post-i18n cleanup)  
**Estimated Effort**: 11-17 hours total

---

_End of 2025 Archive. For current decisions, see [../decision-log.md](../decision-log.md)_
