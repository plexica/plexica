import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

const renderTabs = (defaultValue = 'tab1') => {
  return render(
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content for tab 1</TabsContent>
      <TabsContent value="tab2">Content for tab 2</TabsContent>
      <TabsContent value="tab3">Content for tab 3</TabsContent>
    </Tabs>
  );
};

describe('Tabs', () => {
  it('renders without crashing', () => {
    renderTabs();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('renders all tab triggers', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab 3' })).toBeInTheDocument();
  });

  it('displays the content of the default active tab', () => {
    renderTabs('tab1');
    expect(screen.getByText('Content for tab 1')).toBeInTheDocument();
  });

  it('marks the default tab as selected', () => {
    renderTabs('tab1');
    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    expect(tab1).toHaveAttribute('data-state', 'active');
  });

  it('switches content when a different tab is clicked', async () => {
    const user = userEvent.setup();
    renderTabs('tab1');

    await user.click(screen.getByRole('tab', { name: 'Tab 2' }));

    expect(screen.getByText('Content for tab 2')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('data-state', 'inactive');
  });

  it('supports keyboard navigation between tabs', async () => {
    const user = userEvent.setup();
    renderTabs('tab1');

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    tab1.focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Tab 3' })).toHaveFocus();
  });
});

describe('TabsList', () => {
  it('applies base classes', () => {
    renderTabs();
    const list = screen.getByRole('tablist');
    expect(list).toHaveClass('inline-flex', 'items-center', 'rounded-md', 'bg-muted');
  });

  it('applies custom className', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList className="my-list">
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">A content</TabsContent>
      </Tabs>
    );
    expect(screen.getByRole('tablist')).toHaveClass('my-list');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <Tabs defaultValue="a">
        <TabsList ref={ref}>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content</TabsContent>
      </Tabs>
    );
    expect(ref).toHaveBeenCalled();
  });
});

describe('TabsTrigger', () => {
  it('applies base classes', () => {
    renderTabs();
    const trigger = screen.getByRole('tab', { name: 'Tab 1' });
    expect(trigger).toHaveClass(
      'inline-flex',
      'items-center',
      'justify-center',
      'rounded-sm',
      'text-sm',
      'font-medium'
    );
  });

  it('applies custom className', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a" className="custom-trigger">
            A
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content</TabsContent>
      </Tabs>
    );
    expect(screen.getByRole('tab', { name: 'A' })).toHaveClass('custom-trigger');
  });

  it('can be disabled', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b" disabled>
            B
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>
    );
    expect(screen.getByRole('tab', { name: 'B' })).toBeDisabled();
  });
});

describe('TabsContent', () => {
  it('applies base classes', () => {
    renderTabs();
    const content = screen.getByRole('tabpanel');
    expect(content).toHaveClass('mt-2');
  });

  it('applies custom className', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a" className="custom-content">
          Content
        </TabsContent>
      </Tabs>
    );
    expect(screen.getByRole('tabpanel')).toHaveClass('custom-content');
  });

  it('has correct accessibility role', () => {
    renderTabs();
    const panel = screen.getByRole('tabpanel');
    expect(panel).toBeInTheDocument();
  });
});
