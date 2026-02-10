import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from './Badge';

describe('Badge', () => {
  it('renders without crashing', () => {
    render(<Badge>Status</Badge>);
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies base classes', () => {
    render(<Badge>Badge</Badge>);
    const el = screen.getByText('Badge');
    expect(el).toHaveClass(
      'inline-flex',
      'items-center',
      'rounded-full',
      'text-xs',
      'font-semibold'
    );
  });

  it('applies custom className', () => {
    render(<Badge className="my-custom">Badge</Badge>);
    expect(screen.getByText('Badge')).toHaveClass('my-custom');
  });

  it('applies default variant when no variant is specified', () => {
    render(<Badge>Default</Badge>);
    const el = screen.getByText('Default');
    expect(el).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  it('applies secondary variant', () => {
    render(<Badge variant="secondary">Secondary</Badge>);
    const el = screen.getByText('Secondary');
    expect(el).toHaveClass('bg-secondary', 'text-secondary-foreground');
  });

  it('applies success variant', () => {
    render(<Badge variant="success">Success</Badge>);
    const el = screen.getByText('Success');
    expect(el).toHaveClass('bg-green-500', 'text-white');
  });

  it('applies warning variant', () => {
    render(<Badge variant="warning">Warning</Badge>);
    const el = screen.getByText('Warning');
    expect(el).toHaveClass('bg-orange-500', 'text-white');
  });

  it('applies danger variant', () => {
    render(<Badge variant="danger">Danger</Badge>);
    const el = screen.getByText('Danger');
    expect(el).toHaveClass('bg-red-500', 'text-white');
  });

  it('applies outline variant', () => {
    render(<Badge variant="outline">Outline</Badge>);
    const el = screen.getByText('Outline');
    expect(el).toHaveClass('border-border', 'text-foreground');
  });

  it('passes through HTML attributes', () => {
    render(
      <Badge data-testid="badge" id="status-badge" aria-label="status">
        Info
      </Badge>
    );
    const el = screen.getByTestId('badge');
    expect(el).toHaveAttribute('id', 'status-badge');
    expect(el).toHaveAttribute('aria-label', 'status');
  });

  it('renders as a div element', () => {
    const { container } = render(<Badge>Tag</Badge>);
    const el = container.firstElementChild;
    expect(el?.tagName).toBe('DIV');
  });
});

describe('badgeVariants', () => {
  it('returns correct class string for default variant', () => {
    const classes = badgeVariants({ variant: 'default' });
    expect(classes).toContain('bg-primary');
    expect(classes).toContain('text-primary-foreground');
  });

  it('returns correct class string for danger variant', () => {
    const classes = badgeVariants({ variant: 'danger' });
    expect(classes).toContain('bg-red-500');
    expect(classes).toContain('text-white');
  });

  it('defaults to default variant when no variant passed', () => {
    const classes = badgeVariants();
    expect(classes).toContain('bg-primary');
  });
});
