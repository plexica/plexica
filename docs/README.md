# Plexica Documentation

Welcome to the Plexica documentation hub. This directory contains all technical documentation, guides, and specifications for the Plexica platform.

---

## 📚 Documentation Index

### 🚀 Getting Started

**New to Plexica?** Start here:

- **[Getting Started Guide](./GETTING_STARTED.md)** - Setup instructions and first steps
- **[Quick Test Guide](./testing/QUICK_TEST.md)** - 5-minute smoke test to verify your installation
- **[Main README](../README.md)** - Project overview, tech stack, and quick reference

---

### 🏗️ Architecture & Design

**Understanding the system:**

- **[Frontend Architecture](./ARCHITECTURE.md)** - Complete frontend architecture guide
  - Authentication system (Keycloak SSO with PKCE)
  - Multi-tenant context management
  - Module Federation & plugin system
  - Routing, state management, and API integration
  - Performance optimizations and best practices

**Design Specifications:**

- **[UX Specifications](./design/UX_SPECIFICATIONS.md)** - Complete UX/UI specifications and wireframes
- **[shadcn/ui Guide](./design/SHADCN_UI_GUIDE.md)** - Component library setup and customization guide

---

### 🧪 Testing

**Quality assurance and testing strategies:**

- **[Testing Overview](./testing/README.md)** - Complete testing strategy and approach
- **[Quick Test Guide](./testing/QUICK_TEST.md)** - 5-minute smoke test for essential functionality
- **[Frontend Testing](./testing/FRONTEND_TESTING.md)** - React component and authentication testing
- **[E2E Testing](./testing/E2E_TESTING.md)** - 39-test manual testing checklist and workflows
- **[Backend Testing](./testing/BACKEND_TESTING.md)** - API and integration tests

**Testing Hierarchy:**

```
Quick Test (5 min) → Frontend Testing → E2E Testing → Backend Testing
     ↓                    ↓                 ↓              ↓
  Smoke tests      Component tests    Full workflows   API tests
```

---

### 🛠️ Development Guides

**For developers working on Plexica:**

- **[Contributing Guide](./CONTRIBUTING.md)** - How to contribute to the project
- **[Prisma 7 Migration Guide](./PRISMA_7_MIGRATION.md)** - Database troubleshooting and best practices
- **[Agent Guidelines](../AGENTS.md)** - Guidelines for AI coding agents

---

### 📋 Specifications

**Detailed technical specifications:**

Located in the `../specs/` directory:

- **[Functional Specifications](../specs/FUNCTIONAL_SPECIFICATIONS.md)** - Business requirements and features
- **[Technical Specifications](../specs/TECHNICAL_SPECIFICATIONS.md)** - Detailed architecture and implementation
- **[Project Structure](../specs/PROJECT_STRUCTURE.md)** - Monorepo organization and structure
- **[Plugin Strategy](../specs/PLUGIN_STRATEGY.md)** - Plugin system design and architecture
- **[Workspace Specifications](../specs/WORKSPACE_SPECIFICATIONS.md)** - Workspace feature specifications

---

### 📅 Planning & Roadmap

**Project planning and progress tracking:**

Located in the `../planning/` directory:

- **[Roadmap](../planning/ROADMAP.md)** - Phase 1-5 timeline and milestones
- **[Development Plan](../planning/DEVELOPMENT_PLAN.md)** - Detailed MVP development plan
- **[Milestones](../planning/MILESTONES.md)** - Milestone tracking and completion status
- **[Decisions](../planning/DECISIONS.md)** - Architectural Decision Records (ADR)
- **[Task Breakdown](../planning/tasks/phase-1-mvp.md)** - Granular task lists for Phase 1

**Current Status:**

- See **[STATUS.md](../STATUS.md)** for real-time project status and progress

---

### 📖 Additional Resources

**Other useful documentation:**

- **[Changelog](../changelog/CHANGELOG.md)** - Version history and release notes
- **[Setup Scripts Documentation](../scripts/README.md)** - Automated setup scripts for development environment

---

## 🗂️ Documentation Structure

```
docs/
├── README.md                      # This file - Documentation index
├── GETTING_STARTED.md             # Setup and first steps
├── ARCHITECTURE.md                # Frontend architecture guide
├── CONTRIBUTING.md                # Contribution guidelines
├── PRISMA_7_MIGRATION.md          # Database guide
│
├── design/                        # Design specifications
│   ├── UX_SPECIFICATIONS.md       # UX/UI specifications
│   └── SHADCN_UI_GUIDE.md         # Component library guide
│
└── testing/                       # Testing documentation
    ├── README.md                  # Testing overview
    ├── QUICK_TEST.md              # Quick smoke test
    ├── FRONTEND_TESTING.md        # Frontend testing guide
    ├── E2E_TESTING.md             # E2E testing workflows
    └── BACKEND_TESTING.md         # Backend testing guide
```

---

## 🎯 Quick Links by Role

### For New Developers

1. [Getting Started](./GETTING_STARTED.md)
2. [Frontend Architecture](./ARCHITECTURE.md)
3. [Contributing Guide](./CONTRIBUTING.md)
4. [Quick Test](./testing/QUICK_TEST.md)

### For Frontend Developers

1. [Frontend Architecture](./ARCHITECTURE.md)
2. [UX Specifications](./design/UX_SPECIFICATIONS.md)
3. [shadcn/ui Guide](./design/SHADCN_UI_GUIDE.md)
4. [Frontend Testing](./testing/FRONTEND_TESTING.md)

### For Backend Developers

1. [Technical Specifications](../specs/TECHNICAL_SPECIFICATIONS.md)
2. [Prisma 7 Guide](./PRISMA_7_MIGRATION.md)
3. [Backend Testing](./testing/BACKEND_TESTING.md)
4. [Plugin Strategy](../specs/PLUGIN_STRATEGY.md)

### For QA/Testing

1. [Quick Test Guide](./testing/QUICK_TEST.md)
2. [E2E Testing](./testing/E2E_TESTING.md)
3. [Frontend Testing](./testing/FRONTEND_TESTING.md)
4. [Backend Testing](./testing/BACKEND_TESTING.md)

### For Project Managers

1. [STATUS.md](../STATUS.md)
2. [Roadmap](../planning/ROADMAP.md)
3. [Milestones](../planning/MILESTONES.md)
4. [Functional Specifications](../specs/FUNCTIONAL_SPECIFICATIONS.md)

### For Architects

1. [Technical Specifications](../specs/TECHNICAL_SPECIFICATIONS.md)
2. [Frontend Architecture](./ARCHITECTURE.md)
3. [Plugin Strategy](../specs/PLUGIN_STRATEGY.md)
4. [Architectural Decisions](../planning/DECISIONS.md)

---

## 📝 Documentation Standards

All documentation in this repository follows these standards:

- **Language**: English only (US spelling preferred)
- **Format**: Markdown (.md) with UTF-8 encoding
- **Style**: Clear, concise, technical but accessible
- **Code examples**: Always include language identifier in code blocks
- **File naming**: SCREAMING_SNAKE_CASE for top-level docs

See **[AGENTS.md](../AGENTS.md)** for detailed documentation standards and guidelines.

---

## 🔍 Finding Documentation

### Search by Topic

- **Authentication**: [Frontend Architecture](./ARCHITECTURE.md), [Frontend Testing](./testing/FRONTEND_TESTING.md)
- **Multi-tenancy**: [Technical Specifications](../specs/TECHNICAL_SPECIFICATIONS.md), [Frontend Architecture](./ARCHITECTURE.md)
- **Plugin System**: [Plugin Strategy](../specs/PLUGIN_STRATEGY.md), [Frontend Architecture](./ARCHITECTURE.md)
- **Workspaces**: [Workspace Specifications](../specs/WORKSPACE_SPECIFICATIONS.md)
- **Database**: [Prisma 7 Guide](./PRISMA_7_MIGRATION.md), [Technical Specifications](../specs/TECHNICAL_SPECIFICATIONS.md)
- **Testing**: [Testing Overview](./testing/README.md)
- **Deployment**: [Development Plan](../planning/DEVELOPMENT_PLAN.md), [STATUS.md](../STATUS.md)

### Search by Feature

- **Keycloak Integration**: [Frontend Architecture - Authentication](./ARCHITECTURE.md)
- **Module Federation**: [Frontend Architecture - Plugin System](./ARCHITECTURE.md)
- **RBAC/Permissions**: [Technical Specifications](../specs/TECHNICAL_SPECIFICATIONS.md)
- **Tenant Provisioning**: [Technical Specifications](../specs/TECHNICAL_SPECIFICATIONS.md)
- **UI Components**: [shadcn/ui Guide](./design/SHADCN_UI_GUIDE.md), [UX Specifications](./design/UX_SPECIFICATIONS.md)

---

## 🆘 Need Help?

If you can't find what you're looking for:

1. **Check [STATUS.md](../STATUS.md)** for current project status
2. **Search the documentation** using your IDE or `grep`
3. **Review the [Roadmap](../planning/ROADMAP.md)** to see if the feature is planned
4. **Check [Architectural Decisions](../planning/DECISIONS.md)** for design rationale
5. **See [Contributing Guide](./CONTRIBUTING.md)** for how to ask questions or contribute

---

## 📊 Documentation Stats

- **Total Documentation Files**: 1,281+ markdown files
- **Core Documentation**: 15+ key documents
- **Testing Guides**: 5 comprehensive guides
- **Specifications**: 5 detailed spec documents
- **Planning Documents**: 5+ planning and tracking documents

---

**Last Updated**: January 21, 2026  
**Version**: 1.0.0  
**Maintained by**: Plexica Engineering Team
