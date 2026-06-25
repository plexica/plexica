# Stack Decisions — Plexica v2

> **Project**: Plexica v2 (SaaS multi-tenant enterprise)
> **Status**: Approved · **Last updated**: 2026-06-25
> **Purpose**: Define the frontend stack, conventions, and code generation rules for Plexica v2.
> **All patterns in this library MUST follow these decisions.**
>
> ⚠️ **This file is Plexica-specific.** It overrides any generic FORGE template defaults.
> The original FORGE template assumed Next.js + shadcn/ui. Plexica uses Vite + TanStack Router + @plexica/ui.

---

## 1. Framework

| Decision | Choice | Rationale |
|-----------|--------|-------------|
| Framework | React 19 + Vite | No SSR needed; SPA per tenant subdomain |
| Build tool | Vite (latest) | Fast HMR, ESM-native, Module Federation ready |
| Routing | **TanStack Router v1** | Type-safe routes, data loading, URL state |
| Rendering | **Client-side only (SPA)** | No SSR, no Server Components, no `'use client'` directive |
| TypeScript | Strict mode | `strict: true` in tsconfig — no exceptions |

**Rule**: There is NO `'use client'` directive in Plexica — it is a pure Vite SPA.
Every component is a client component by default. Never add `'use client'`.

---

## 2. Component Library

| Decision | Choice | Rationale |
|-----------|--------|-------------|
| Library | **@plexica/ui** (Radix UI + Tailwind) | Custom design system wrapping Radix primitives |
| NOT used | ~~shadcn/ui CLI~~ | Plexica has its own component package, not generated via CLI |
| Primitives | Radix UI (via @plexica/ui) | Built-in accessibility, composable |
| Customization | Extend @plexica/ui or add to packages/ui/src/ | Never copy-paste shadcn components directly |

**@plexica/ui component inventory** (all available for import):

```ts
import {
  Button, Input, Textarea, Select, Badge, Pagination, Tabs,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  DialogRoot, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose,
  DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup,
  PopoverRoot, PopoverTrigger, PopoverContent, PopoverAnchor,
  ToastProvider, ToastViewport, Toast,
  ConfirmDialog,
  FileUpload,
  ToggleSwitch,
  DateRangePicker,
  InlineFilter,
  cn,
} from '@plexica/ui'
```

**Components NOT in @plexica/ui** (use these local alternatives or build new ones):

| Missing shadcn/ui component | Plexica alternative |
|-----------------------------|---------------------|
| `Skeleton` | `<SkeletonLoader>` in `apps/web/src/components/feedback/skeleton-loader.tsx` |
| `Alert / AlertDescription` | Custom inline `<div role="alert">` with Tailwind tokens |
| `Card / CardHeader` | Custom `<div>` with `rounded-lg border border-neutral-200 bg-white p-4` |
| `ScrollArea` | Native CSS `overflow-y-auto` |
| `Separator` | `<hr>` or `<div className="border-t border-neutral-200">` |
| `Sheet` (drawer) | `DialogRoot` + `DialogContent` with side panel styling |
| `Avatar / AvatarFallback` | `apps/web/src/components/layout/avatar.tsx` |
| `Checkbox` | Radix `@radix-ui/react-checkbox` directly |
| `Switch` | `<ToggleSwitch>` from @plexica/ui |
| `Command / Combobox` | Radix + custom implementation |
| `Form / FormField` | react-hook-form + Zod directly (no shadcn Form wrapper) |
| `Progress` | Native `<progress>` or custom div |
| `AlertDialog` | `<ConfirmDialog>` from @plexica/ui |
| `Sonner / Toaster` | `<ToastProvider>` + `<Toast>` from @plexica/ui |

---

## 3. Styling

| Decision | Choice | Rationale |
|-----------|--------|-------------|
| Engine | Tailwind CSS v3 | Utility-first, design tokens as CSS custom properties |
| Preset | `@plexica/ui/tailwind-preset` | Consumed in every app's `tailwind.config.ts` |
| Variants | `class-variance-authority` (cva) | Used inside @plexica/ui components |
| Class merging | `tailwind-merge` + `cn` helper from `@plexica/ui` | Standard Plexica pattern |
| Dark mode | **CSS custom properties via `[data-theme="dark"]`** | NOT via Tailwind `dark:` variants |
| Animations | Tailwind `animate-*` + CSS transitions | No external animation libraries |

**Critical dark mode rule**: Plexica dark mode works by swapping CSS custom property values
via the `[data-theme="dark"]` attribute on `<html>`. Do NOT use Tailwind `dark:` variant classes
(e.g. `dark:bg-neutral-800`) — they won't work because `darkMode` is not configured in Tailwind.
Use semantic color tokens instead: `bg-neutral-100` will automatically become the dark-mode
equivalent when the CSS variable swaps.

**cn helper**:
```tsx
import { cn } from '@plexica/ui'

// Usage
<div className={cn('base-classes', condition && 'conditional-class')} />
```

---

## 4. State Management

| State | Solution | Rationale |
|-------|-----------|-------------|
| Server state (API data) | **TanStack Query v5** | Caching, refetch, optimistic updates |
| Client state (UI) | `useState` / `useReducer` (default) | Local state first |
| Global UI state | **Zustand** (one store only) | auth, theme, sidebar — nothing else |
| URL state (filters, pagination) | **TanStack Router `useSearch()`** | Type-safe, bookmarkable, shareable |
| Form state | **React Hook Form v7** | Performant, minimal re-renders |
| Form validation | **Zod** | TypeScript-first, shared client/server |

**TanStack Query pattern** (use `keepPreviousData` for smooth pagination):
```tsx
// hooks/use-items.ts
export function useItems(filters: Filters) {
  return useQuery({
    queryKey: ['items', filters],
    queryFn: () => api.getItems(filters),
    placeholderData: keepPreviousData,
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: NewItem) => api.createItem(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items'] }),
  })
}
```

**TanStack Router URL state pattern** (NOT `useSearchParams` from Next.js):
```tsx
// In route definition:
const searchSchema = z.object({ page: z.number().default(1), status: z.string().optional() })

// In component:
const { page, status } = useSearch({ from: '/workspaces' })
const navigate = useNavigate()
navigate({ search: (prev) => ({ ...prev, page: 2 }) })
```

---

## 5. Forms

| Rule | Detail |
|--------|-----------|
| Schema | Zod defined ONCE, shared client/server |
| Hookup | `useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })` |
| Error display | Per-field `<p className="text-sm text-error">{errors.field.message}</p>` |
| Submit | `handleSubmit` with Zod validation + useMutation |
| Server error | Catch from mutation, `setError('root', { message })` |
| Debounce | Validation `mode: 'onBlur'` for long forms |
| NO shadcn Form wrapper | Use RHF register/control directly with @plexica/ui inputs |

```tsx
// Standard form pattern
const form = useForm<FormValues>({ resolver: zodResolver(schema), mode: 'onBlur' })
const { mutate, isPending } = useCreateItem()

<form onSubmit={form.handleSubmit((data) => mutate(data))}>
  <Input {...form.register('name')} aria-invalid={!!form.formState.errors.name} />
  {form.formState.errors.name && (
    <p className="text-sm text-error">{form.formState.errors.name.message}</p>
  )}
  <Button type="submit" loading={isPending}>Save</Button>
</form>
```

---

## 6. Project Structure

```
apps/web/src/
├── pages/              # Page components (one per route)
├── components/
│   ├── layout/         # Shell: sidebar, header, breadcrumb, user-menu, avatar
│   ├── feedback/       # Cross-cutting: empty-state, skeleton-loader
│   ├── error/          # Error boundaries and fallbacks
│   ├── workspace/      # Workspace-specific components
│   ├── user/           # User management components
│   ├── audit/          # Audit log components
│   └── settings/       # Settings-specific components
├── hooks/              # Custom React hooks (all data fetching)
├── services/           # API clients and service modules
├── stores/             # Zustand stores (auth, workspace)
├── types/              # TypeScript type definitions
├── i18n/               # Translations (react-intl message catalogs)
├── router.tsx          # TanStack Router root setup
└── main.tsx            # App entry point

packages/ui/src/
├── components/         # @plexica/ui component library
├── tokens/             # CSS custom properties (colors, spacing, radius, typography)
├── lib/                # Utilities (cn)
└── index.ts            # Barrel exports
```

---

## 7. File Naming & Exports

| Type | Pattern | Example |
|------|---------|---------|
| Pages | **kebab-case.tsx** | `workspace-list-page.tsx` |
| Components | **kebab-case.tsx** | `create-workspace-dialog.tsx` |
| Hooks | **kebab-case.ts** | `use-workspaces.ts` |
| Stores | **kebab-case.ts** | `auth-store.ts` |
| Services | **kebab-case.ts** | `workspace-api.ts` |
| Types | **kebab-case.ts** | `workspace.ts` |
| i18n | **messages.{locale}.ts** | `messages.en.ts` |

**Export rule**: Named exports everywhere. No default exports (except `main.tsx`).

```tsx
// workspace-list-page.tsx — named export
export function WorkspaceListPage(): JSX.Element { ... }

// create-workspace-dialog.tsx — named export
export function CreateWorkspaceDialog({ ... }: Props): JSX.Element { ... }
```

---

## 8. Routing

**TanStack Router** — type-safe file-based or code-based routing.

```tsx
// Navigation
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'

// Link component
<Link to="/workspaces/$workspaceId" params={{ workspaceId: ws.id }}>
  {ws.name}
</Link>

// Programmatic navigation
const navigate = useNavigate()
navigate({ to: '/workspaces', search: { status: 'active' } })

// URL params
const { workspaceId } = useParams({ from: '/workspaces/$workspaceId' })

// Search params (URL state)
const { page, status } = useSearch({ from: '/workspaces' })
```

---

## 9. i18n

All UI strings go through **react-intl**. No hardcoded strings.

```tsx
import { FormattedMessage, useIntl } from 'react-intl'

// JSX string
<h1><FormattedMessage id="workspace.list.title" /></h1>

// Imperative string (for aria-label, placeholder, etc.)
const intl = useIntl()
intl.formatMessage({ id: 'common.search' })
```

Translations live in `apps/web/src/i18n/messages.en.ts`.

---

## 10. Accessibility Baseline

| Requirement | Standard |
|-----------|----------|
| Contrast | WCAG 2.1 AA (4.5:1 text, 3:1 large / interactive) |
| Keyboard | Everything reachable via Tab + Enter/Esc/Arrows |
| Screen reader | Correct aria-label, aria-describedby, role |
| Focus | Visible focus ring: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500` |
| Heading hierarchy | h1→h2→h3 hierarchy, no skips, one h1 per page |
| Landmarks | `<main>`, `<nav>`, `<aside>` semantic tags |
| Dynamic updates | `aria-live="polite"` for loading states, `role="alert"` for errors |

---

## 11. Testing Convention

| Layer | Tool | What to test |
|-------|------|-------------|
| Unit | **Vitest v4** | Pure functions, hooks, Zod schemas |
| Component | **Vitest + @testing-library/react** | Rendering, interactions, states |
| Integration | **Vitest + real app** | API endpoints with middleware active |
| E2E | **Playwright** | Every user flow (mandatory, CI-blocking) |

**Test pattern**:
```tsx
// __tests__/workspace-list-page.test.tsx
describe('WorkspaceListPage', () => {
  it('shows skeleton while loading')
  it('shows workspace list when loaded')
  it('shows empty state when no workspaces')
  it('shows error with retry when API fails')
  it('filters by status via URL params')
})
```

---

## 12. Responsive Breakpoints

| Name | Width | Layout |
|------|-----------|--------|
| Mobile | 320-767px | Single column, mobile drawer nav |
| Tablet | 768-1023px | 2 columns, collapsible sidebar |
| Desktop | 1024-1439px | Full layout with sidebar |
| Wide | 1440px+ | Full layout, max-width container |

Tailwind breakpoints: `sm` (640), `md` (768), `lg` (1024), `xl` (1280), `2xl` (1536).
Container max-width: `max-w-7xl mx-auto`.

---

## 13. Available Packages

| Package | Status | Usage |
|---------|--------|-------|
| @tanstack/react-query | ✅ installed | Server state |
| @tanstack/react-router | ✅ installed | Routing + URL state |
| react-hook-form | ✅ installed | Form state |
| zod | ✅ installed | Validation |
| react-intl | ✅ installed | i18n |
| lucide-react | ✅ installed (via @plexica/ui) | Icons |
| zustand | ✅ installed | Global UI state |
| @plexica/ui | ✅ installed | Component library |
| sonner | ❌ NOT installed | Use @plexica/ui Toast instead |
| recharts | ❌ NOT installed | Add via ADR if needed |
| @tanstack/react-table | ❌ NOT installed | Add via ADR if needed |
| next-themes | ❌ NOT installed | Dark mode via data-theme attribute |

---

## Appendix A: tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx"
  }
}
```

## Appendix B: tailwind.config.ts

```ts
// apps/web/tailwind.config.ts
import uiPreset from '@plexica/ui/tailwind-preset'
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  presets: [uiPreset],
  // NO darkMode config — dark mode is handled via CSS custom properties
  // and the [data-theme="dark"] attribute on <html>. Never use dark: variants.
}

export default config
```
