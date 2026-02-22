# ADR-016: Frontend Multi-Step Wizard State Management

> Architectural Decision Record documenting the state management approach
> for the tenant creation wizard in `apps/super-admin`.
> Created by the `forge-architect` agent via `/forge-adr`.

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Status   | Accepted                                                   |
| Author   | forge-architect                                            |
| Date     | 2026-02-22                                                 |
| Deciders | Frontend Team, Architecture                                |
| Spec Ref | `.forge/specs/001-multi-tenancy/design-spec.md` (Screen 2) |

---

## Context

The current tenant creation UI (`apps/super-admin/src/components/tenants/
CreateTenantModal.tsx`) is a single-step modal with only name and slug fields.
The spec requires replacing this with a 4-step wizard:

1. **Basics**: name, slug (auto-generated + editable), admin email
2. **Plugins**: plugin selection checkboxes (optional, skippable)
3. **Theme**: logo, colors, font, custom CSS (optional, skippable)
4. **Review**: summary of all steps with edit links, then "Create Tenant"

The wizard must:

- Validate each step independently before allowing navigation to the next
- Preserve data when navigating back and forth between steps
- Support skipping optional steps (Plugins, Theme)
- Persist state to sessionStorage for crash recovery (browser reload)
- Transition to a provisioning progress view after submission
- Handle async validation (slug uniqueness check with debounce)

We need to decide how to manage the wizard's form state, step navigation,
and validation across 4 steps.

## Options Considered

### Option A: React Hook Form with Global FormProvider

- **Description**: Wrap the entire wizard in a single `<FormProvider>` from
  React Hook Form. All 4 steps share one form instance. Step validation uses
  `trigger()` to validate specific fields per step.
- **Pros**:
  - React Hook Form is already available in the project
  - Single form state — no manual synchronization needed
  - Built-in validation, dirty tracking, error management
  - Excellent performance (uncontrolled inputs by default)
- **Cons**:
  - Single form means all validation schemas must be combined with conditional
    logic per step
  - Step navigation logic still needs custom implementation
  - SessionStorage persistence requires custom `useEffect` for form values
  - FormProvider re-renders can be tricky in large forms
  - Tight coupling between form library and step navigation
- **Effort**: Medium

### Option B: useReducer with Per-Step React Hook Form (Chosen)

- **Description**: Use React `useReducer` for step navigation and
  cross-step state management. Each step renders its own React Hook Form
  instance with a step-specific Zod schema. On "Next", the step's form
  submits and dispatches `COMPLETE_STEP` with validated data to the reducer.
  The reducer holds the canonical `WizardData` and step index.
- **Pros**:
  - Clean separation: reducer owns navigation + accumulated data, RHF owns
    per-step validation
  - Each step has its own focused Zod schema (no conditional validation)
  - Reducer state shape is easily typed and serializable to sessionStorage
  - Per-step RHF instances are lightweight and isolated
  - Step-specific form logic doesn't leak across steps
  - Testable: reducer is a pure function, easy to unit test
- **Cons**:
  - Slightly more boilerplate than Option A (reducer + per-step forms)
  - Must manually populate RHF defaults from reducer state when navigating back
  - Two state systems (reducer + RHF) require clear ownership boundaries
- **Effort**: Medium

### Option C: External State Library (Zustand / Jotai)

- **Description**: Use Zustand or Jotai to create a wizard store with step
  state, navigation actions, and persistence middleware.
- **Pros**:
  - Clean API, minimal boilerplate
  - Built-in persistence middleware (Zustand `persist`)
  - Zustand's subscribe API enables fine-grained re-renders
- **Cons**:
  - Adds a new dependency to the project (requires ADR per Constitution Art. 2.2)
  - Over-engineered for a single wizard component
  - Team must learn new state library API
  - Zustand/Jotai not in approved stack (Art. 2.1)
- **Effort**: Medium (including dependency approval process)

## Decision

**Chosen option**: Option B — useReducer with Per-Step React Hook Form

**Rationale**:

This approach leverages two patterns already available in the codebase
(React's built-in `useReducer` and React Hook Form) without adding new
dependencies. The key insight is **separation of concerns**:

- **useReducer** owns: current step index, accumulated wizard data across
  steps, wizard lifecycle (idle → filling → provisioning → success/error)
- **React Hook Form** (per step) owns: individual field validation, dirty
  tracking, error display, async validation (slug check)

This avoids the complexity of cramming 4 steps into a single RHF instance
(Option A) and avoids adding a new dependency (Option C).

### State Shape

```typescript
type WizardStep = 1 | 2 | 3 | 4;
type WizardPhase = 'filling' | 'provisioning' | 'success' | 'error';

interface WizardData {
  basics: {
    name: string;
    slug: string;
    adminEmail: string;
  } | null;
  plugins: {
    pluginIds: string[];
  } | null;
  theme: {
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    customCss?: string;
  } | null;
}

interface WizardState {
  step: WizardStep;
  phase: WizardPhase;
  data: WizardData;
  errors: Record<string, string> | null;
}

type WizardAction =
  | { type: 'COMPLETE_STEP'; step: WizardStep; data: Partial<WizardData> }
  | { type: 'GO_BACK' }
  | { type: 'SKIP_STEP' }
  | { type: 'GO_TO_STEP'; step: WizardStep }
  | { type: 'START_PROVISIONING' }
  | { type: 'PROVISIONING_SUCCESS' }
  | { type: 'PROVISIONING_ERROR'; errors: Record<string, string> }
  | { type: 'RESET' };
```

### SessionStorage Persistence

```typescript
const STORAGE_KEY = 'plexica-create-tenant-wizard';

function useWizardState() {
  const [state, dispatch] = useReducer(wizardReducer, null, () => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : initialState;
  });

  useEffect(() => {
    if (state.phase === 'filling') {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [state]);

  return [state, dispatch] as const;
}
```

### Per-Step Validation Schemas

Each step has its own Zod schema:

```typescript
// Step 1: Basics
const basicsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: z
    .string()
    .regex(
      /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/,
      'Invalid slug format (3–64 chars, lowercase, numbers, hyphens)'
    ),
  adminEmail: z.string().email('Valid email required'),
});

// Step 2: Plugins (always valid — selection is optional)
const pluginsSchema = z.object({
  pluginIds: z.array(z.string().uuid()).default([]),
});

// Step 3: Theme (all fields optional)
const themeSchema = z.object({
  logoUrl: z.string().url().optional().or(z.literal('')),
  faviconUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .or(z.literal('')),
  secondaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .or(z.literal('')),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .or(z.literal('')),
  fontFamily: z.string().max(100).optional().or(z.literal('')),
  customCss: z.string().max(10240).optional().or(z.literal('')),
});
```

## Consequences

### Positive

- No new dependencies — uses React built-ins + existing RHF
- Reducer is a pure function: easy to unit test with predictable state
  transitions
- Per-step Zod schemas are focused and maintainable
- SessionStorage persistence is lightweight (~1KB serialized state)
- Clear ownership: reducer for navigation, RHF for field-level concerns
- Easy to extend with additional steps in the future

### Negative

- Two state systems require developers to understand the boundary
  (reducer = cross-step, RHF = within-step)
- Navigating back requires manually setting RHF `defaultValues` from reducer
  state (minor boilerplate)
- ~50 lines of reducer boilerplate

### Neutral

- SessionStorage is cleared on provisioning start (no stale data risk)
- Wizard state is not shared with other components (scoped to modal)
- Pattern is consistent with other multi-step flows if added later

## Constitution Alignment

| Article | Alignment | Notes                                                                     |
| ------- | --------- | ------------------------------------------------------------------------- |
| Art. 1  | Supports  | WCAG 2.1 AA: focus trap, step announcements, error messages via aria-live |
| Art. 2  | Compliant | No new dependencies; uses React 19 + existing RHF                         |
| Art. 3  | Supports  | Feature module pattern; wizard is self-contained in tenants/ directory    |
| Art. 5  | Supports  | Zod validation on all user input before API submission (Art. 5.3)         |
| Art. 7  | Compliant | camelCase functions, PascalCase components, kebab-case files              |
| Art. 8  | Supports  | Pure reducer is trivially unit-testable; per-step forms are isolated      |

## Follow-Up Actions

- [ ] Create `useWizardState.ts` hook with reducer and sessionStorage logic
- [ ] Create per-step Zod schemas in `wizard-schemas.ts`
- [ ] Build `CreateTenantWizard.tsx` replacing `CreateTenantModal.tsx`
- [ ] Unit test reducer state transitions (all action types)
- [ ] Unit test each Zod schema with valid/invalid inputs

## Related Decisions

- ADR-009: Tailwind CSS v4 Tokens (design tokens used in wizard components)
- ADR-015: Tenant Provisioning Orchestration (backend provisioning this wizard triggers)
- ADR-010: Shared Types Package (wizard DTOs may be shared)

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```
