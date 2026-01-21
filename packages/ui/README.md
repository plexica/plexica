# @plexica/ui

Plexica UI Component Library - A comprehensive set of React components built on top of Radix UI, designed for the Plexica platform.

## Installation

```bash
npm install @plexica/ui
# or
yarn add @plexica/ui
# or
pnpm add @plexica/ui
```

## Usage

```tsx
import { Button, Card, Header, Sidebar } from '@plexica/ui';
import '@plexica/ui/styles.css';

function App() {
  return (
    <div>
      <Header>
        <h1>My App</h1>
      </Header>
      <Card>
        <Button>Click me</Button>
      </Card>
    </div>
  );
}
```

## Components

### Base Components
- **Button** - Buttons in various styles and sizes (primary, secondary, danger, ghost, link)
- **Card** - Container component with header, content, and footer
- **Avatar** - User avatar with image and fallback
- **Badge** - Small status indicators and counts

### Navigation Components
- **Tabs** - Tabbed navigation interface
- **Breadcrumbs** - Hierarchical navigation trail
- **Dropdown** - Dropdown menus with items and separators

### Form Components
- **Label** - Form field labels
- **Input** - Text input with validation states
- **Select** - Dropdown select component
- **Textarea** - Multi-line text input
- **Checkbox** - Checkbox input with label support
- **RadioGroup** - Radio button group
- **Switch** - Toggle switch component
- **Slider** - Range slider input

### Feedback Components
- **Toast** - Toast notifications in various styles
- **Modal/Dialog** - Modal dialogs and confirmations
- **Spinner** - Loading indicators
- **Progress** - Progress bar indicator
- **Tooltip** - Contextual tooltips

### Data Display Components
- **Table** - Data tables with sorting and actions
- **EmptyState** - Empty state placeholders with CTAs
- **Separator** - Visual divider between content

### Layout Components
- **Header** - Application header with logo and actions
- **Sidebar** - Collapsible sidebar navigation
- **Footer** - Application footer

## Development

```bash
# Install dependencies
pnpm install

# Start Storybook
pnpm run dev

# Build the library
pnpm run build

# Build Storybook
pnpm run build-storybook

# Run tests in watch mode
pnpm test

# Run tests with interactive UI
pnpm test:ui

# Run tests once (CI mode)
pnpm test:run

# Generate coverage report
pnpm test:coverage
```

## Testing

This library uses **Vitest** for component testing, integrated with Storybook via the `@storybook/addon-vitest` addon.

### Testing Stack

- **Vitest** - Fast test runner with Vite integration
- **@testing-library/react** - React component testing utilities
- **@testing-library/jest-dom** - Custom matchers for DOM assertions
- **@testing-library/user-event** - User interaction simulation

### Writing Tests

Test files should be placed next to the component they're testing with the `.test.tsx` extension:

```
src/components/Button/
  ├── Button.tsx
  ├── Button.stories.tsx
  └── Button.test.tsx
```

### Example Test

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders with default props', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    
    render(<Button onClick={handleClick}>Click me</Button>);
    const button = screen.getByRole('button');
    
    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Best Practices

1. **Test behavior, not implementation** - Focus on how users interact with components
2. **Use semantic queries** - Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Test accessibility** - Ensure components are accessible (proper ARIA attributes, keyboard navigation)
4. **Mock external dependencies** - Use `vi.fn()` and `vi.mock()` for external services
5. **Keep tests focused** - One assertion concept per test
6. **Use userEvent over fireEvent** - Simulates more realistic user interactions

### Storybook Integration

The `@storybook/addon-vitest` addon allows you to view test results directly in Storybook when running the dev server (`pnpm dev`).

## Design System

This component library follows the Plexica design specifications:

- **Typography**: JetBrains Mono (variable font)
- **Styling**: Tailwind CSS v4 with custom design tokens
- **Components**: Built on Radix UI primitives
- **Utilities**: class-variance-authority for variant management, tailwind-merge for className handling

## Technology Stack

- **React** 19.2.3
- **TypeScript** 5.7.3
- **Tailwind CSS** 4.1.18
- **Radix UI** - Accessible component primitives
- **Storybook** 10.1.11 - Component documentation and development
- **Vitest** 4.0.17 - Component testing
- **Vite** 7.3.1 - Build tool

## Styling

The library uses Tailwind CSS v4 with a custom design system. Import the styles in your application:

```tsx
import '@plexica/ui/styles.css';
```

Components use utility classes and the `class-variance-authority` library for variant management, ensuring consistent styling and easy customization.

## License

MIT

## Contributing

See the main Plexica repository for contribution guidelines.
