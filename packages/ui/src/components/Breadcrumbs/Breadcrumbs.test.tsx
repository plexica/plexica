import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs, BreadcrumbsWithHome } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  const defaultItems = [
    { label: 'Products', href: '/products' },
    { label: 'Widgets', href: '/products/widgets' },
    { label: 'Widget A' },
  ];

  it('renders without crashing', () => {
    render(<Breadcrumbs items={defaultItems} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeInTheDocument();
  });

  it('renders a nav element with aria-label', () => {
    render(<Breadcrumbs items={defaultItems} />);
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
  });

  it('applies custom className', () => {
    render(<Breadcrumbs items={defaultItems} className="custom-breadcrumbs" />);
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveClass('custom-breadcrumbs');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Breadcrumbs ref={ref} items={defaultItems} />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
  });

  it('renders all item labels', () => {
    render(<Breadcrumbs items={defaultItems} />);
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Widgets')).toBeInTheDocument();
    expect(screen.getByText('Widget A')).toBeInTheDocument();
  });

  it('marks the last item with aria-current="page"', () => {
    render(<Breadcrumbs items={defaultItems} />);
    const lastItem = screen.getByText('Widget A');
    expect(lastItem).toHaveAttribute('aria-current', 'page');
  });

  it('marks an item with current=true as aria-current="page"', () => {
    const items = [
      { label: 'Home', href: '/' },
      { label: 'Dashboard', current: true },
      { label: 'Settings' },
    ];
    render(<Breadcrumbs items={items} />);
    expect(screen.getByText('Dashboard')).toHaveAttribute('aria-current', 'page');
  });

  it('renders non-current items as links', () => {
    render(<Breadcrumbs items={defaultItems} />);
    const link = screen.getByText('Products');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/products');
  });

  it('renders the last item as a span, not a link', () => {
    render(<Breadcrumbs items={defaultItems} />);
    const lastItem = screen.getByText('Widget A');
    expect(lastItem.tagName).toBe('SPAN');
  });

  it('uses a custom separator when provided', () => {
    render(<Breadcrumbs items={defaultItems} separator={<span data-testid="sep">/</span>} />);
    const separators = screen.getAllByTestId('sep');
    expect(separators).toHaveLength(2);
  });
});

describe('BreadcrumbsWithHome', () => {
  it('auto-prepends a Home item', () => {
    const items = [{ label: 'Settings' }];
    render(<BreadcrumbsWithHome items={items} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders Home as a link to /', () => {
    const items = [{ label: 'Page' }];
    render(<BreadcrumbsWithHome items={items} />);
    const homeLink = screen.getByText('Home');
    expect(homeLink.tagName).toBe('A');
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<BreadcrumbsWithHome ref={ref} items={[{ label: 'Page' }]} />);
    expect(ref).toHaveBeenCalled();
  });
});
