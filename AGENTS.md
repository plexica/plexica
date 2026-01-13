# Agent Guidelines for Plexica Specifications

This repository contains the functional and technical specifications for the Plexica platform. These guidelines help AI coding agents work effectively with this documentation.

## Repository Structure

```
plexica-specs/
├── README.md                      # Overview and navigation
├── AGENTS.md                      # This file
│
├── specs/                         # Core specifications
│   ├── FUNCTIONAL_SPECIFICATIONS.md
│   ├── TECHNICAL_SPECIFICATIONS.md
│   ├── PROJECT_STRUCTURE.md
│   └── PLUGIN_STRATEGY.md
│
├── planning/                      # Project planning and tracking
│   ├── ROADMAP.md                 # Phase roadmap and timeline
│   ├── DEVELOPMENT_PLAN.md        # Detailed MVP development plan
│   ├── MILESTONES.md              # Milestone tracking
│   ├── DECISIONS.md               # Architectural Decision Records (ADR)
│   └── tasks/
│       └── phase-1-mvp.md         # Granular task breakdown
│
├── changelog/                     # Version history
│   └── CHANGELOG.md
│
└── templates/                     # Document templates (future)
```

### Document Types

**Specifications (`specs/`)**: Authoritative technical and functional documentation
- These define WHAT the system should do and HOW it should work
- Changes require careful review as they impact implementation

**Planning (`planning/`)**: Project management and decision tracking
- Roadmaps, timelines, task breakdowns
- Living documents that evolve as project progresses
- Should be updated as milestones are completed

**Changelog (`changelog/`)**: Historical record of changes
- Updated when significant features/versions are released

## Documentation Standards

### Language Policy

**IMPORTANT**: All documentation in this repository MUST be written in **English only**.

- ✅ **English**: Required for all documents (specs, planning, changelog, templates, comments)
- ❌ **Italian or other languages**: Not permitted (except for specific business terms if necessary)
- **Rationale**: English ensures accessibility for international teams, easier collaboration, and industry-standard practices

**Note**: Previous versions of this documentation used Italian. All documents have been translated to English as of January 2025.

### File Format
- **Format**: Markdown (.md)
- **Encoding**: UTF-8
- **Line endings**: LF (Unix-style)
- **Max line length**: No hard limit, but aim for readability (~120 chars)

### Writing Style

**Language**: English (US spelling preferred)

**Tone**:
- Clear and concise
- Technical but accessible
- Use bullet points for lists
- Use tables for structured data

**Formatting**:
```markdown
# H1: Main sections (##, ###, etc. for subsections)
- Use `-` for unordered lists
- Use `1.` for ordered lists
- Use **bold** for emphasis
- Use `code` for technical terms
- Use triple backticks for code blocks with language identifier
```

### Code Examples

Always include language identifier in code blocks:
```typescript
// ✅ Good
```typescript
interface Example {
  id: string;
}
```

// ❌ Bad
```
interface Example {
  id: string;
}
```
```

Supported languages: `typescript`, `javascript`, `python`, `sql`, `yaml`, `bash`, `json`

### Technical Specifications Format

**Architecture Diagrams**: Use ASCII art for simple diagrams
```
┌─────────────┐
│   Service   │
└─────────────┘
       ↓
┌─────────────┐
│  Database   │
└─────────────┘
```

**Configuration Examples**: Always include:
- File path as comment
- Complete, working examples
- Explanation of key parameters

**Code Snippets**: Must include:
- File path in comment (e.g., `// src/modules/auth/auth.service.ts`)
- Correct TypeScript syntax (Python deferred to future phases)
- Meaningful variable names
- Brief inline comments for complex logic

**Note on Python**: Python support has been deferred to Phase 5+. All MVP documentation (Phases 1-4) should reference TypeScript only.

### Naming Conventions

**Files**: Use SCREAMING_SNAKE_CASE for top-level docs
- ✅ `FUNCTIONAL_SPECIFICATIONS.md`
- ❌ `functional-specifications.md`

**Headings**: Use Title Case for main sections, Sentence case for subsections
- ✅ `## 2. Database Architecture`
- ✅ `### 2.1.1 Isolation strategy`

**Technical Terms**: Maintain consistency
- Use `tenant` (not `customer`, `client`, `organization`)
- Use `plugin` (not `module`, `extension`, `add-on`)
- Use `multi-tenancy` (with hyphen)
- Use `web` for frontend app (not `shell`, which was renamed)
- Use `core-api` for backend service (not just `api` or `backend`)
- Use `TypeScript` (not `TS` in formal docs)

### Tables

Use consistent table formatting:
```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
```

Align pipes for better readability in source.

## Editing Guidelines

### When Adding New Sections

1. **Check consistency**: Ensure terminology matches existing content
2. **Update table of contents**: If document has ToC, update it
3. **Cross-reference**: Link to related sections when relevant (use relative paths)
4. **Version info**: Update "Ultimo aggiornamento" at document end
5. **Update README.md**: Add links to new documents in main navigation

### When Modifying Existing Content

1. **Preserve structure**: Don't change numbering unless reorganizing
2. **Maintain examples**: Ensure code examples still work with changes
3. **Update dependencies**: If changing architecture, update related sections
4. **Check references**: Update all sections that reference modified content

### When Adding Code Examples

**TypeScript/JavaScript**:
- Use ES6+ syntax
- Include type annotations
- Use async/await (not callbacks)
- Follow decorators pattern for services/controllers

**Python** (Phase 5+ only):
- Use type hints
- Follow PEP 8
- Use async/await for async operations
- **Note**: Python examples should only appear in future-phase planning docs

**SQL**:
- Uppercase keywords: `SELECT`, `FROM`, `WHERE`
- Include schema name when relevant
- Add comments for complex queries

**YAML**:
- Use 2-space indentation
- Include comments for non-obvious config

## Common Patterns

### Service Example Template
```typescript
// File: apps/core-api/src/modules/<module>/<module>.service.ts

@Injectable()
export class ExampleService {
  constructor(
    private readonly dependency: DependencyService,
    @Inject('CONFIG') private config: Config
  ) {}
  
  async methodName(param: Type): Promise<ReturnType> {
    // Implementation
  }
}
```

**Note**: This path references the monorepo structure described in `specs/PROJECT_STRUCTURE.md`

### Database Schema Template
```prisma
// File: packages/database/prisma/schema.prisma

model EntityName {
  id        String   @id @default(uuid())
  field     String
  createdAt DateTime @default(now()) @map("created_at")
  
  @@map("entity_names")
  @@schema("schema_name")
}
```

**Note**: This path references the monorepo structure described in `specs/PROJECT_STRUCTURE.md`

## Quality Checklist

Before finalizing changes:
- [ ] All code blocks have language identifiers
- [ ] File paths are included in code comments
- [ ] Technical terms are consistent throughout
- [ ] Tables are properly formatted
- [ ] Cross-references are valid
- [ ] Examples are complete and correct
- [ ] All text is in English (no Italian or other languages)
- [ ] Document structure follows existing pattern
- [ ] Version/date updated if significant changes

## Working with Planning Documents

### Before Starting Development

When beginning work on a milestone or task:

1. **Check current status**: Read `planning/MILESTONES.md` to understand current phase/milestone
2. **Review decisions**: Check `planning/DECISIONS.md` for architectural decisions (ADRs)
3. **Understand roadmap**: Read `planning/ROADMAP.md` for timeline and dependencies
4. **Task breakdown**: Use `planning/tasks/phase-X-*.md` for granular task lists

### During Development

1. **Update milestone status**: Mark tasks as in-progress/completed in `planning/MILESTONES.md`
2. **Document decisions**: Add new ADRs to `planning/DECISIONS.md` when making architectural choices
3. **Track blockers**: Update `planning/MILESTONES.md` with any blockers or risks
4. **Update task lists**: Check off completed tasks in `planning/tasks/` files

### After Completing Features

1. **Update changelog**: Add entry to `changelog/CHANGELOG.md` with version and changes
2. **Review specs**: Ensure `specs/` documents reflect any implementation changes
3. **Update README**: Add any new documentation or navigation links

## Notes for AI Agents

- **Be cautious with edits**: These are reference documents; accuracy is critical
- **Maintain consistency**: Don't introduce new terminology without reason
- **Ask before major restructuring**: Large changes need human review
- **Preserve formatting**: Existing structure is intentional
- **Consider impact**: Changes may affect implementation teams
- **Use relative paths**: When cross-referencing, use `specs/`, `planning/`, etc.
- **Update planning docs proactively**: Keep milestone and task tracking current

## Version Control

**Date Format**: `DD MMM YYYY` (e.g., "13 Jan 2025")

**Version Format**: 
- Major version for complete rewrites
- Minor version for new sections
- Patch for corrections/clarifications

Current version indicators at document end:
```markdown
---

*Plexica Technical Document v1.0*  
*Last updated: January 2025*  
*Author: Plexica Engineering Team*
```
