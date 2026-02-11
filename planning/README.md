# Planning Directory

**Last Updated**: 2026-02-11  
**Status**: Active  
**Owner**: Engineering Team

This directory contains project planning documents including roadmap, milestones, architectural decisions (ADRs), and detailed task breakdowns.

## 📋 Documentation Overview

### Core Planning Documents

**[ROADMAP.md](./ROADMAP.md)**  
Strategic vision and timeline for Plexica development across 5 phases.

- Phase 1-5 objectives and timelines
- Major milestones for each phase
- Current phase progress and focus
- Dependencies and critical path items

**[MILESTONES.md](./MILESTONES.md)** (1.3K lines)  
Detailed milestone tracking and completion status.

- Phase 1 MVP Core (Phase 1-2.4): 100% complete
- Individual milestone objectives and criteria
- Completion status and blockers
- Owner and start/end dates
- Real-time progress tracking

**[DECISIONS.md](./DECISIONS.md)**  
Architectural Decision Records (ADRs).

- ADR-001: Monorepo vs Multi-Repo Choice
- ADR-002: Database Multi-Tenancy Strategy
- ADR-003+: Future architectural decisions
- Decision rationale, consequences, and alternatives

### Development Planning

~~**[DEVELOPMENT_PLAN.md](../.github/docs/deprecated/planning/DEVELOPMENT_PLAN.md)**~~ _**Deprecated** (archived 2026-02-11)_  
Historical development plan preserved for reference.

- **Status**: Archived - See [MILESTONES.md](./MILESTONES.md) and [PROJECT_STATUS.md](./PROJECT_STATUS.md) for current status
- **Replacement**: Use [MILESTONES.md](./MILESTONES.md) for milestone tracking and [PROJECT_STATUS.md](./PROJECT_STATUS.md) for current progress
- **Archive Location**: [.github/docs/deprecated/planning/DEVELOPMENT_PLAN.md](../.github/docs/deprecated/planning/DEVELOPMENT_PLAN.md)

### Task Breakdown by Phase

**[tasks/phase-1-mvp.md](./tasks/phase-1-mvp.md)**  
Detailed task breakdown for Phase 1 MVP Core.

- **Status**: Completed
- Foundation setup and infrastructure
- Multi-tenancy implementation
- Authentication and authorization
- Core plugin system
- Frontend application
- Testing and deployment

**[tasks/phase-2-plugin-ecosystem.md](./tasks/phase-2-plugin-ecosystem.md)**  
Detailed task breakdown for Phase 2 Plugin Ecosystem.

- **Status**: In Progress
- Plugin registry and marketplace
- Plugin communication patterns
- Testing infrastructure
- Documentation

**[tasks/M2.4-PLUGIN-REGISTRY.md](./tasks/M2.4-PLUGIN-REGISTRY.md)** & **[tasks/M2.4-PLUGIN-MARKETPLACE.md](./tasks/M2.4-PLUGIN-MARKETPLACE.md)**  
Specific tasks for M2.4 milestone.

- Plugin registry implementation
- Marketplace UI and features
- Discovery and installation
- Testing and validation

## 🔗 Related Documents

**Specifications**: See [specs/README.md](../specs/README.md) for technical and functional specs

**Developer Guides**: See [docs/README.md](../docs/README.md) for implementation guides

**Agent Guidelines**: See [AGENTS.md - Documentation Management](../AGENTS.md#documentation-management)

## 📖 How to Use This Directory

1. **Project Timeline?** → Start with [ROADMAP.md](./ROADMAP.md)
2. **Current Progress?** → See [MILESTONES.md](./MILESTONES.md)
3. **Architecture Decisions?** → Read [DECISIONS.md](./DECISIONS.md)
4. **Phase-Specific Tasks?** → Check [tasks/](./tasks/) subdirectory
5. **Finding a Task?** → Search in [tasks/phase-N-\*.md](./tasks/) files

## 📋 Understanding Status Labels

- ✅ **Completed**: Milestone or phase is finished and validated
- 🟡 **In Progress**: Currently being worked on
- 🔴 **Blocked**: Waiting on dependencies or issues
- 📋 **Planned**: Scheduled for upcoming phase

## ✅ Decision Record Quality Checklist

When creating architectural decisions (ADRs), ensure:

- [ ] ADR number is sequential (ADR-001, ADR-002, etc.)
- [ ] Date and status are current
- [ ] Context clearly explains the problem
- [ ] Decision is explicit and unambiguous
- [ ] Consequences (positive, negative, neutral) are documented
- [ ] Alternatives considered are explained
- [ ] Implementation timeline is provided
- [ ] Related decisions are linked
- [ ] Code examples show how decision manifests

## 🔄 Current Phase Status

**Phase**: 1-2 MVP Core  
**Overall Completion**: ~94%  
**Last Updated**: 2025-02-03

### Breakdown:

- Backend (Core API): ✅ 100%
- Frontend Web App: ✅ 100%
- Workspaces: ✅ 100%
- Testing Infrastructure: 🟡 50% (in progress)
- Deployment: ✅ 100%

**Next Phase**: Phase 2 - Plugin Ecosystem Enhancement (M2.5+)

---

**Total Documents**: 6  
**Total Lines**: ~4,300  
**Last Reviewed**: 2025-02-03
