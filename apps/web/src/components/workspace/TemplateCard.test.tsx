// apps/web/src/components/workspace/TemplateCard.test.tsx
//
// T011-22: Unit tests for TemplateCard component.
// Spec 011 Phase 4 — FR-021, FR-022.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateCard } from './TemplateCard';
import type { TemplateCardData } from './TemplateCard';

function makeTemplate(overrides: Partial<TemplateCardData> = {}): TemplateCardData {
  return {
    id: 'tmpl-1',
    name: 'Marketing Suite',
    description: 'A template for marketing teams.',
    isDefault: false,
    sourcePluginName: 'marketing-plugin',
    items: [{ type: 'plugin' }, { type: 'plugin' }, { type: 'page' }, { type: 'setting' }],
    ...overrides,
  };
}

describe('TemplateCard', () => {
  it('renders the template name', () => {
    render(<TemplateCard template={makeTemplate()} />);
    expect(screen.getByText('Marketing Suite')).toBeInTheDocument();
  });

  it('renders template description', () => {
    render(<TemplateCard template={makeTemplate()} />);
    expect(screen.getByText('A template for marketing teams.')).toBeInTheDocument();
  });

  it('renders source plugin name', () => {
    render(<TemplateCard template={makeTemplate()} />);
    expect(screen.getByText('marketing-plugin')).toBeInTheDocument();
  });

  it('renders item count breakdown', () => {
    render(<TemplateCard template={makeTemplate()} />);
    expect(screen.getByText('2 plugins')).toBeInTheDocument();
    expect(screen.getByText('1 page')).toBeInTheDocument();
    expect(screen.getByText('1 setting')).toBeInTheDocument();
  });

  it('shows Default badge when isDefault is true', () => {
    render(<TemplateCard template={makeTemplate({ isDefault: true })} />);
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('does not show Default badge when isDefault is false', () => {
    render(<TemplateCard template={makeTemplate({ isDefault: false })} />);
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
  });

  it('has role="radio" with aria-checked=false when not selected', () => {
    render(<TemplateCard template={makeTemplate()} />);
    expect(screen.getByRole('radio')).toHaveAttribute('aria-checked', 'false');
  });

  it('has aria-checked=true when selected', () => {
    render(<TemplateCard template={makeTemplate()} selected />);
    expect(screen.getByRole('radio')).toHaveAttribute('aria-checked', 'true');
  });

  it('shows checkmark icon when selected', () => {
    const { container } = render(<TemplateCard template={makeTemplate()} selected />);
    // Check icon rendered inside the selected state span
    const checkSpan = container.querySelector('[aria-hidden="true"]');
    expect(checkSpan).toBeInTheDocument();
  });

  it('calls onSelect with template id on click', () => {
    const onSelect = vi.fn();
    render(<TemplateCard template={makeTemplate()} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('radio'));
    expect(onSelect).toHaveBeenCalledWith('tmpl-1');
  });

  it('calls onSelect on Enter key', () => {
    const onSelect = vi.fn();
    render(<TemplateCard template={makeTemplate()} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole('radio'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('tmpl-1');
  });

  it('calls onSelect on Space key', () => {
    const onSelect = vi.fn();
    render(<TemplateCard template={makeTemplate()} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole('radio'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith('tmpl-1');
  });

  it('renders without description when description is null', () => {
    render(<TemplateCard template={makeTemplate({ description: null })} />);
    // should not throw; name still visible
    expect(screen.getByText('Marketing Suite')).toBeInTheDocument();
  });

  it('renders without source plugin when sourcePluginName is null', () => {
    render(<TemplateCard template={makeTemplate({ sourcePluginName: null })} />);
    expect(screen.queryByText('by')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // F-022: tabIndex prop wired through (roving tabindex support)
  // -------------------------------------------------------------------------

  it('uses passed tabIndex prop on the radio element', () => {
    render(<TemplateCard template={makeTemplate()} tabIndex={-1} />);
    expect(screen.getByRole('radio')).toHaveAttribute('tabindex', '-1');
  });
});
