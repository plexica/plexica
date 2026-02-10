import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  CardSkeleton,
} from './Card';

describe('Card', () => {
  it('renders without crashing', () => {
    render(<Card data-testid="card">Content</Card>);
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies base classes', () => {
    render(<Card data-testid="card" />);
    const el = screen.getByTestId('card');
    expect(el).toHaveClass('rounded-lg', 'border', 'border-border', 'bg-card', 'shadow-sm');
  });

  it('applies custom className', () => {
    render(<Card data-testid="card" className="custom-class" />);
    expect(screen.getByTestId('card')).toHaveClass('custom-class');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Card ref={ref} />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });

  it('passes through HTML attributes', () => {
    render(<Card data-testid="card" id="my-card" aria-label="A card" />);
    const el = screen.getByTestId('card');
    expect(el).toHaveAttribute('id', 'my-card');
    expect(el).toHaveAttribute('aria-label', 'A card');
  });
});

describe('CardHeader', () => {
  it('renders with base classes', () => {
    render(<CardHeader data-testid="header">Header</CardHeader>);
    const el = screen.getByTestId('header');
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass('flex', 'flex-col', 'space-y-1.5', 'p-6');
  });

  it('applies custom className', () => {
    render(<CardHeader data-testid="header" className="extra" />);
    expect(screen.getByTestId('header')).toHaveClass('extra');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<CardHeader ref={ref} />);
    expect(ref).toHaveBeenCalled();
  });
});

describe('CardTitle', () => {
  it('renders as an h3 element', () => {
    render(<CardTitle>Title</CardTitle>);
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Title');
  });

  it('applies base classes', () => {
    render(<CardTitle>Title</CardTitle>);
    const heading = screen.getByRole('heading');
    expect(heading).toHaveClass('text-h3', 'font-semibold', 'leading-none', 'tracking-tight');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<CardTitle ref={ref}>Title</CardTitle>);
    expect(ref).toHaveBeenCalled();
  });
});

describe('CardDescription', () => {
  it('renders with text', () => {
    render(<CardDescription>Description text</CardDescription>);
    expect(screen.getByText('Description text')).toBeInTheDocument();
  });

  it('applies base classes', () => {
    render(<CardDescription data-testid="desc">Desc</CardDescription>);
    expect(screen.getByTestId('desc')).toHaveClass('text-sm', 'text-muted-foreground');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<CardDescription ref={ref}>Desc</CardDescription>);
    expect(ref).toHaveBeenCalled();
  });
});

describe('CardContent', () => {
  it('renders with base classes', () => {
    render(<CardContent data-testid="content">Body</CardContent>);
    const el = screen.getByTestId('content');
    expect(el).toHaveClass('p-6', 'pt-0');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<CardContent ref={ref}>Body</CardContent>);
    expect(ref).toHaveBeenCalled();
  });
});

describe('CardFooter', () => {
  it('renders with base classes', () => {
    render(<CardFooter data-testid="footer">Footer</CardFooter>);
    const el = screen.getByTestId('footer');
    expect(el).toHaveClass('flex', 'items-center', 'p-6', 'pt-0');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<CardFooter ref={ref}>Footer</CardFooter>);
    expect(ref).toHaveBeenCalled();
  });
});

describe('CardSkeleton', () => {
  it('renders a skeleton loading state', () => {
    render(<CardSkeleton />);
    const pulseEl = document.querySelector('.animate-pulse');
    expect(pulseEl).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<CardSkeleton className="my-skeleton" />);
    // className is applied to the outer Card wrapper
    const card = document.querySelector('.my-skeleton');
    expect(card).toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<CardSkeleton ref={ref} />);
    expect(ref).toHaveBeenCalled();
  });
});

describe('Card composition', () => {
  it('renders a complete card with all subcomponents', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>My Title</CardTitle>
          <CardDescription>My Description</CardDescription>
        </CardHeader>
        <CardContent>Content body</CardContent>
        <CardFooter>Footer content</CardFooter>
      </Card>
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Title' })).toBeInTheDocument();
    expect(screen.getByText('My Description')).toBeInTheDocument();
    expect(screen.getByText('Content body')).toBeInTheDocument();
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });
});
