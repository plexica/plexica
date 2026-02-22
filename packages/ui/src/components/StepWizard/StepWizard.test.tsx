// File: packages/ui/src/components/StepWizard/StepWizard.test.tsx
// T001-27: Unit tests for StepWizard component.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StepWizard, type WizardStep } from './StepWizard';

const STEPS: WizardStep[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'plugins', label: 'Plugins', isOptional: true },
  { id: 'theme', label: 'Theme', isOptional: true },
  { id: 'review', label: 'Review' },
];

function renderWizard(overrides: Partial<Parameters<typeof StepWizard>[0]> = {}) {
  const defaults = {
    steps: STEPS,
    currentStep: 0,
    title: 'Create Tenant',
    open: true,
    onNext: vi.fn(),
    onBack: vi.fn(),
    onSkip: vi.fn(),
    onCancel: vi.fn(),
    children: <div>Step content</div>,
  };
  return render(<StepWizard {...defaults} {...overrides} />);
}

describe('StepWizard', () => {
  it('renders the correct number of step circles', () => {
    renderWizard();
    // 4 steps: each has a visible number or checkmark inside a circle div
    // The step indicator nav has aria-valuemax equal to step count
    const nav = screen.getByRole('progressbar');
    expect(nav).toHaveAttribute('aria-valuemax', String(STEPS.length));
  });

  it('marks the active step circle with aria-current="step"', () => {
    renderWizard({ currentStep: 1 });
    // Step index 1 (Plugins) should be marked current
    const circles = document.querySelectorAll('[aria-current="step"]');
    expect(circles).toHaveLength(1);
  });

  it('disables the Next button when isNextDisabled is true', () => {
    renderWizard({ isNextDisabled: true });
    const nextBtn = screen.getByRole('button', { name: /next step/i });
    expect(nextBtn).toBeDisabled();
  });

  it('shows Skip button only for optional steps', () => {
    // Step 0 (Basics) is not optional — no Skip button
    renderWizard({ currentStep: 0 });
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull();

    // Step 1 (Plugins) is optional — Skip button shown
    renderWizard({ currentStep: 1 });
    expect(screen.getByRole('button', { name: /skip plugins/i })).toBeInTheDocument();
  });

  it('calls onNext when Next button is clicked', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderWizard({ onNext });
    await user.click(screen.getByRole('button', { name: /next step/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('calls onBack when Back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderWizard({ currentStep: 2, onBack });
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('calls onSkip when Skip button is clicked on optional step', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    renderWizard({ currentStep: 1, onSkip });
    await user.click(screen.getByRole('button', { name: /skip plugins/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('hides Back button on first step by default', () => {
    renderWizard({ currentStep: 0 });
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull();
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWizard({ onCancel });
    await user.click(screen.getByRole('button', { name: /cancel wizard/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows "Create Tenant" label on last step', () => {
    renderWizard({ currentStep: STEPS.length - 1 });
    expect(screen.getByRole('button', { name: /create tenant/i })).toBeInTheDocument();
  });

  it('renders dialog title', () => {
    renderWizard({ title: 'My Wizard' });
    expect(screen.getByText('My Wizard')).toBeInTheDocument();
  });

  it('renders children content', () => {
    renderWizard({ children: <p>Hello from step</p> });
    expect(screen.getByText('Hello from step')).toBeInTheDocument();
  });

  it('progressbar aria attributes reflect current step', () => {
    renderWizard({ currentStep: 2 });
    const nav = screen.getByRole('progressbar');
    expect(nav).toHaveAttribute('aria-valuenow', '3');
    expect(nav).toHaveAttribute('aria-valuemin', '1');
    expect(nav).toHaveAttribute('aria-valuemax', '4');
  });
});
