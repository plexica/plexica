import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar, SidebarSection, SidebarItem, SidebarDivider } from './Sidebar';

describe('Sidebar', () => {
  it('renders without crashing', () => {
    render(<Sidebar>Content</Sidebar>);
    const aside = screen.getByRole('complementary');
    expect(aside).toBeInTheDocument();
  });

  it('renders an aside element', () => {
    render(<Sidebar>Content</Sidebar>);
    expect(screen.getByRole('complementary').tagName).toBe('ASIDE');
  });

  it('applies custom className', () => {
    render(<Sidebar className="custom-sidebar">Content</Sidebar>);
    expect(screen.getByRole('complementary')).toHaveClass('custom-sidebar');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Sidebar ref={ref}>Content</Sidebar>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
  });

  it('renders expanded by default (w-60)', () => {
    render(<Sidebar>Content</Sidebar>);
    expect(screen.getByRole('complementary')).toHaveClass('w-60');
  });

  it('renders collapsed width when collapsed is true', () => {
    render(<Sidebar collapsed>Content</Sidebar>);
    expect(screen.getByRole('complementary')).toHaveClass('w-16');
  });

  it('renders a collapse toggle button when onCollapsedChange is provided', () => {
    const handleChange = vi.fn();
    render(<Sidebar onCollapsedChange={handleChange}>Content</Sidebar>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('does not render a toggle button when onCollapsedChange is not provided', () => {
    render(<Sidebar>Content</Sidebar>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onCollapsedChange when toggle is clicked', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Sidebar collapsed={false} onCollapsedChange={handleChange}>
        Content
      </Sidebar>
    );
    await user.click(screen.getByRole('button'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('calls onCollapsedChange with false when expanding', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Sidebar collapsed onCollapsedChange={handleChange}>
        Content
      </Sidebar>
    );
    await user.click(screen.getByRole('button'));
    expect(handleChange).toHaveBeenCalledWith(false);
  });
});

describe('SidebarSection', () => {
  it('renders children', () => {
    render(<SidebarSection>Section content</SidebarSection>);
    expect(screen.getByText('Section content')).toBeInTheDocument();
  });

  it('renders a title when provided', () => {
    render(<SidebarSection title="Navigation">Items</SidebarSection>);
    expect(screen.getByText('Navigation')).toBeInTheDocument();
  });

  it('does not render a title heading when title is not provided', () => {
    render(<SidebarSection>Items</SidebarSection>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <SidebarSection data-testid="section" className="custom-section">
        Content
      </SidebarSection>
    );
    expect(screen.getByTestId('section')).toHaveClass('custom-section');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<SidebarSection ref={ref}>Content</SidebarSection>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });
});

describe('SidebarItem', () => {
  it('renders as an anchor element', () => {
    render(<SidebarItem>Dashboard</SidebarItem>);
    const item = screen.getByText('Dashboard').closest('a');
    expect(item).toBeInTheDocument();
    expect(item!.tagName).toBe('A');
  });

  it('applies custom className', () => {
    render(<SidebarItem className="custom-item">Item</SidebarItem>);
    expect(screen.getByText('Item').closest('a')).toHaveClass('custom-item');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<SidebarItem ref={ref}>Item</SidebarItem>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLAnchorElement);
  });

  it('renders an icon when provided', () => {
    render(<SidebarItem icon={<span data-testid="icon">ic</span>}>Dashboard</SidebarItem>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders a badge when provided', () => {
    render(<SidebarItem badge={5}>Notifications</SidebarItem>);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('hides label and badge when collapsed', () => {
    render(
      <SidebarItem collapsed badge={3}>
        Dashboard
      </SidebarItem>
    );
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('applies active styles when active', () => {
    render(<SidebarItem active>Active Item</SidebarItem>);
    const link = screen.getByText('Active Item').closest('a');
    expect(link).toHaveClass('bg-accent', 'text-foreground');
  });
});

describe('SidebarDivider', () => {
  it('renders a horizontal rule', () => {
    render(<SidebarDivider />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<SidebarDivider className="custom-divider" />);
    expect(screen.getByRole('separator')).toHaveClass('custom-divider');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<SidebarDivider ref={ref} />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLHRElement);
  });
});
