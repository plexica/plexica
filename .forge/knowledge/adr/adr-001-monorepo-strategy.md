# ADR-001: Monorepo Strategy (Turborepo + pnpm)

**Date**: 2025-01-13  
**Status**: Accepted  
**Deciders**: Engineering Team  
**Context**: Code organization strategy for Plexica multi-package platform

## Context and Problem Statement

Plexica consists of multiple packages: core API, frontend apps (web, super-admin), internal plugins, SDK, shared packages (database, event-bus, types, ui), and CLI tools. We need to decide how to organize this codebase to maximize developer productivity, type safety, and CI/CD efficiency.

## Decision Drivers

- End-to-end type safety across packages (API ↔ frontend ↔ SDK)
- Developer experience (single clone, unified tooling)
- CI/CD simplicity (single pipeline, atomic commits)
- Cross-package refactoring speed
- Dependency management consistency

## Considered Options

1. **Monorepo with Turborepo + pnpm** (chosen)
2. **Multi-repo** (8+ separate repositories)
3. **Monorepo with Lerna**

## Decision Outcome

**Chosen option**: Monorepo with Turborepo + pnpm — provides the best balance of type safety, developer experience, and CI/CD simplicity for a platform with tightly coupled packages.

### Positive Consequences

- End-to-end type safety between packages
- Facilitated cross-package refactoring
- Single source of truth for dependencies
- Simplified CI/CD (single pipeline)
- Improved developer experience (single `git clone`)
- Atomic cross-package commits

### Negative Consequences

- Larger repository size over time
- Requires specific tooling knowledge (Turborepo, pnpm workspaces)
- Learning curve for new developers unfamiliar with monorepo patterns

## Implementation Notes

- pnpm workspaces configured in `pnpm-workspace.yaml`
- Turborepo handles build orchestration and caching
- Packages organized under `apps/` (deployable) and `packages/` (shared libraries)
- Per Constitution Article 2.1: pnpm ≥8.0 is the approved package manager

## Related Decisions

- ADR-010: @plexica/types Shared Package (leverages monorepo for type sharing)
- ADR-011: Module Federation for Plugin Frontend Loading
- Constitution Article 2.1: Approved technology stack

## References

- Source: `planning/DECISIONS.md` (ADR-001)
- [Turborepo Documentation](https://turbo.build/repo)
- [pnpm Workspaces](https://pnpm.io/workspaces)
