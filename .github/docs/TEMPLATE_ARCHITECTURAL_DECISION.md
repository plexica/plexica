# Documentation Template: Architectural Decision Record (ADR)

**Purpose**: Use this template when documenting significant architectural decisions in `planning/DECISIONS.md`.

---

````markdown
## ADR-XXX: [Decision Title]

**Date**: YYYY-MM-DD  
**Status**: Proposed | Accepted | Deprecated | Superseded  
**Deciders**: Name1, Name2  
**Tags**: #architecture #tag2

### Context

[What problem or situation required this decision? Describe the business context, constraints, and options under consideration. Include relevant background information that helps understand why this decision matters.]

**Problem Statement**:
[1-2 sentences capturing the core issue]

**Constraints**:

- [Constraint 1]
- [Constraint 2]
- [Constraint 3]

**Stakeholders**:

- Team A: Concern about X
- Team B: Concern about Y

### Decision

[What decision was made? Be clear and explicit. This is the "we will..." statement.]

**Chosen Approach**:
[1 paragraph clearly stating the decision]

**Implementation Details**:

```typescript
// File: src/modules/example/example.service.ts
// Show how this decision manifests in code

export class ExampleService {
  // Implementation following the decision
  async execute(): Promise<void> {
    // Code demonstrating the architectural decision
  }
}
```
````

### Consequences

#### Positive

- [Pro 1] - Why this is beneficial
- [Pro 2] - How this helps the project
- [Pro 3] - Long-term advantage

#### Negative

- [Con 1] - What we give up or sacrifice
- [Con 2] - Operational burden or cost
- [Con 3] - Potential future limitation

#### Neutral (Trade-offs)

- [Consideration 1] - This is neither good nor bad, just different
- [Consideration 2] - Context-dependent impact

### Alternatives Considered

#### 1. **Alternative Name**: [Brief Description]

**Description**: [Detailed explanation of this alternative]

```typescript
// Example code showing this approach
```

**Why Not Chosen**:

- Issue 1: [Problem with this approach]
- Issue 2: [Another concern]
- Trade-off: [What we lose]

#### 2. **Alternative Name**: [Brief Description]

**Description**: [Detailed explanation]

**Why Not Chosen**:

- Issue 1: [Problem]
- Issue 2: [Problem]

### Implementation Timeline

- **Phase 1** (Week 1-2): [Tasks]
- **Phase 2** (Week 3-4): [Tasks]
- **Rollout** (Week 5): [How deployed to production]

### Related Decisions

- **ADR-XXX**: [How this relates to previous decision]
- **ADR-YYY**: [Prerequisite decision]
- **ADR-ZZZ**: [Likely to be superseded by]

### References

- [Link to issue/PR] - Discussion on GitHub
- [Link to specification] - Related technical spec
- [Link to research] - External resource or article

### Decision Log

| Date       | Event                      | Notes                             |
| ---------- | -------------------------- | --------------------------------- |
| YYYY-MM-DD | Initial proposal           | Discussion in architecture review |
| YYYY-MM-DD | Status changed to Accepted | Team consensus reached            |
| YYYY-MM-DD | Implementation complete    | Deployed to production            |

---

```

## Notes for Using This Template

1. **Date Format**: Use YYYY-MM-DD (ISO 8601)
2. **Status Values**:
   - `Proposed`: Under consideration
   - `Accepted`: Approved and will be implemented
   - `Deprecated`: No longer applies
   - `Superseded`: Replaced by ADR-XXX
3. **Tags**: Use lowercase with # prefix, comma-separated
4. **Code Examples**: Show how the decision manifests in actual code
5. **Honesty**: Include both positive AND negative consequences - don't hide trade-offs
6. **Alternatives**: Explain why better alternatives were rejected (not just list them)
7. **Implementation**: Provide concrete timeline and phasing if relevant

## When to Create an ADR

✅ **Create an ADR for**:
- Significant architectural changes
- Technology choices (new framework, library, etc.)
- Database strategy changes
- Deployment model decisions
- Design pattern selections for core systems

❌ **Don't create an ADR for**:
- Minor bug fixes
- Small feature additions
- Local refactoring decisions
- Tool upgrades (unless significant impact)

## ADR Numbering

- ADRs are numbered sequentially: ADR-001, ADR-002, ADR-003, etc.
- Do not reuse numbers
- If an ADR is deprecated, keep it in the record with "Deprecated" status
```
