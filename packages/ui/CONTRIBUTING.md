# Contributing to @plexica/ui

**Date**: February 10, 2026
**Version**: 1.0

---

## Quick Start

```bash
# Development (Storybook)
cd packages/ui
pnpm dev                    # Starts Storybook at http://localhost:6006

# Testing
pnpm test                   # Run tests in watch mode
pnpm test:run               # Run tests once
pnpm test:coverage          # Run tests with coverage report

# Linting & Type Check
pnpm lint
pnpm type-check             # tsc --noEmit

# Build
pnpm build                  # Builds CJS + ESM + DTS via tsup
```

---

## Directory Structure

Every component lives in its own directory under `src/components/`:

```
src/components/ComponentName/
├── ComponentName.tsx          # Implementation
├── ComponentName.test.tsx     # Tests
├── ComponentName.stories.tsx  # Storybook stories
└── index.ts                   # Re-export (optional)
```

---

## Component Implementation Rules

### 1. Naming

| What             | Convention              | Example              |
| ---------------- | ----------------------- | -------------------- |
| Directory        | PascalCase              | `Button/`            |
| Component file   | PascalCase              | `Button.tsx`         |
| Test file        | PascalCase + `.test`    | `Button.test.tsx`    |
| Story file       | PascalCase + `.stories` | `Button.stories.tsx` |
| Component name   | PascalCase              | `Button`             |
| Props interface  | PascalCase + `Props`    | `ButtonProps`        |
| Variant function | camelCase + `Variants`  | `buttonVariants`     |

### 2. Implementation Pattern

Every component follows this pattern: **Radix UI primitive + CVA variants + cn() class merging + forwardRef**.

```tsx
// File: packages/ui/src/components/Example/Example.tsx

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// 1. Define variants with CVA
const exampleVariants = cva(
  // Base classes (always applied)
  'inline-flex items-center justify-center text-sm font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive text-white',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

// 2. Define props extending native element + CVA variants
export interface ExampleProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof exampleVariants> {}

// 3. Use forwardRef, apply cn() with variants
const Example = React.forwardRef<HTMLDivElement, ExampleProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(exampleVariants({ variant, size }), className)} {...props} />
    );
  }
);
Example.displayName = 'Example';

// 4. Export component and variants
export { Example, exampleVariants };
```

### 3. Key Rules

| Rule                           | Details                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Always use `forwardRef`**    | Every component must forward its ref to the underlying DOM element                                                 |
| **Always extend native props** | Use `React.HTMLAttributes<HTMLElement>` or `React.ComponentPropsWithoutRef<typeof Primitive>` for Radix components |
| **Always support `className`** | Use `cn()` to merge `className` prop with internal classes                                                         |
| **Use CVA for variants**       | Define variants with explicit `variants` and `defaultVariants` objects                                             |
| **Use semantic tokens**        | Use `bg-primary`, `text-foreground`, `border-border` -- never `bg-white`, `text-black`                             |
| **Set `displayName`**          | Every forwardRef component must set `Component.displayName = 'Component'`                                          |
| **Export from index.ts**       | Every component must be re-exported in `src/index.ts`                                                              |

### 4. Radix UI Components

For components wrapping Radix UI primitives:

```tsx
import * as SelectPrimitive from '@radix-ui/react-select';

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger ref={ref} className={cn('...classes...', className)} {...props}>
    {children}
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;
```

### 5. Components Without Variants

Simple layout/wrapper components that don't need CVA:

```tsx
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';
```

### 6. Accessibility Requirements

- Use proper ARIA roles (e.g., `role="alert"` for Alert, `role="status"` for Spinner)
- Support keyboard navigation where applicable
- Include `aria-label` for icon-only buttons
- Use `<span className="sr-only">` for screen reader text
- Radix primitives handle most a11y automatically -- don't override their ARIA attributes

---

## Variant Naming Rules

| Name          | Use For                                         | Components    |
| ------------- | ----------------------------------------------- | ------------- |
| `default`     | Standard neutral look                           | Badge, Alert  |
| `primary`     | Primary action (alias for `default` in buttons) | Button        |
| `secondary`   | Reduced emphasis                                | Button, Badge |
| `destructive` | Red, dangerous/irreversible                     | Button, Alert |
| `danger`      | Alias for `destructive`                         | Button, Badge |
| `outline`     | Border-only, no fill                            | Button, Badge |
| `ghost`       | Transparent, hover reveals bg                   | Button        |
| `link`        | Text link appearance                            | Button        |
| `success`     | Green, positive outcome                         | Badge, Alert  |
| `warning`     | Yellow/orange, attention                        | Badge, Alert  |
| `info`        | Blue, informational                             | Alert         |

Do NOT introduce new variant names without adding them to this table.

---

## Story Requirements

Every component must have a story covering:

1. **Default** rendering
2. **All variants** (one story per variant or a grid showing all)
3. **All sizes** (if applicable)
4. **Interactive states** (disabled, loading, error)
5. **Composition examples** (how to use with other components)

```tsx
// File: packages/ui/src/components/Example/Example.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Example } from './Example';

const meta: Meta<typeof Example> = {
  title: 'Components/Example',
  component: Example,
  args: {
    children: 'Example content',
  },
};
export default meta;

type Story = StoryObj<typeof Example>;

export const Default: Story = {};

export const Secondary: Story = {
  args: { variant: 'secondary' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-2">
      <Example variant="default">Default</Example>
      <Example variant="secondary">Secondary</Example>
      <Example variant="destructive">Destructive</Example>
    </div>
  ),
};
```

---

## Test Requirements

Every component must have a test file covering:

| Category          | What to Test                                            |
| ----------------- | ------------------------------------------------------- |
| **Smoke**         | Renders without crashing                                |
| **Variants**      | Each variant applies correct classes                    |
| **Sizes**         | Each size applies correct classes                       |
| **Props**         | Custom `className` is merged, native props pass through |
| **Ref**           | `ref` is forwarded to correct DOM element               |
| **Interaction**   | Click, focus, keyboard events work correctly            |
| **Disabled**      | Disabled state prevents interaction                     |
| **Accessibility** | Correct ARIA attributes, roles, labels                  |

```tsx
// File: packages/ui/src/components/Example/Example.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Example } from './Example';

describe('Example', () => {
  it('renders without crashing', () => {
    render(<Example>Content</Example>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Example className="custom-class">Content</Example>);
    expect(screen.getByText('Content')).toHaveClass('custom-class');
  });

  it('forwards ref', () => {
    const ref = { current: null } as React.RefObject<HTMLDivElement>;
    render(<Example ref={ref}>Content</Example>);
    expect(ref.current).toBeInstanceOf(HTMLElement);
  });

  it('renders secondary variant', () => {
    render(<Example variant="secondary">Content</Example>);
    // Verify the correct variant classes are applied
    expect(screen.getByText('Content')).toHaveClass('bg-secondary');
  });
});
```

### Test Infrastructure

- **Framework**: Vitest 4.x
- **Environment**: jsdom
- **Rendering**: `@testing-library/react`
- **User events**: `@testing-library/user-event`
- **Assertions**: `@testing-library/jest-dom` (`.toBeInTheDocument()`, `.toHaveClass()`, etc.)
- **Setup**: `vitest.setup.ts` runs `cleanup()` after each test

---

## Scaffolding New Components

Use the scaffold script to generate a new component with all required files:

```bash
# From packages/ui directory
node scripts/scaffold-component.mjs MyComponent
```

This creates:

```
src/components/MyComponent/
├── MyComponent.tsx
├── MyComponent.test.tsx
└── MyComponent.stories.tsx
```

And adds the export to `src/index.ts`.

---

## Checklist Before Submitting

- [ ] Component follows the CVA + cn() + forwardRef pattern
- [ ] Component extends native HTML element props
- [ ] Component supports `className` override
- [ ] Component has `displayName` set
- [ ] Component is exported from `src/index.ts`
- [ ] Component has a `.stories.tsx` file covering all variants
- [ ] Component has a `.test.tsx` file covering rendering, variants, ref, and interaction
- [ ] All tests pass (`pnpm test:run`)
- [ ] TypeScript compiles cleanly (`pnpm type-check`)
- [ ] Only semantic color tokens are used (no `bg-white`, `text-black`, etc.)
- [ ] Dark mode works (verified in Storybook with dark background)

---

_@plexica/ui Contributing Guide v1.0_
