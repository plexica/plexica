// File: packages/ui/src/components/StepWizard/StepWizard.tsx
// T001-17: Multi-step wizard shell per ADR-016 and Spec 001 design-spec Screen 2.
//
// Features:
// - Step indicator (circles + connectors + labels, labels hidden on mobile)
// - Navigation: Back / Next / Skip (optional steps only) / Cancel
// - Focus trap via Radix Dialog
// - WCAG 2.1 AA: aria-current="step" on active circle, role="progressbar"

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { Button } from '../Button/Button';
import { Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WizardStep {
  id: string;
  label: string;
  description?: string;
  isOptional?: boolean;
}

export interface StepWizardProps {
  /** All steps in order */
  steps: WizardStep[];
  /** Zero-based index of the active step */
  currentStep: number;
  /** Dialog title (also used as aria-label) */
  title: string;
  /** Content to render for the current step */
  children: React.ReactNode;
  /** Disables the "Next" button (e.g. while the current step has validation errors) */
  isNextDisabled?: boolean;
  /** Hides the "Back" button on the first step (default: true) */
  hideBackOnFirst?: boolean;
  /** Whether the wizard is open */
  open: boolean;
  /** Called when Next / Finish is clicked */
  onNext: () => void;
  /** Called when Back is clicked */
  onBack: () => void;
  /** Called when Skip is clicked (only shown for optional steps) */
  onSkip?: () => void;
  /** Called when Cancel / close is triggered */
  onCancel: () => void;
  /** Override the "Next" button label (default: "Next" on intermediate steps, "Create Tenant" on last) */
  nextLabel?: string;
  /** Whether to show a loading spinner on Next (e.g. while submitting) */
  isNextLoading?: boolean;
  className?: string;
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({ steps, currentStep }: { steps: WizardStep[]; currentStep: number }) {
  return (
    <nav
      aria-label="Progress"
      role="progressbar"
      aria-valuenow={currentStep + 1}
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-valuetext={`Step ${currentStep + 1} of ${steps.length}: ${steps[currentStep]?.label}`}
      className="flex items-center w-full"
    >
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        const isUpcoming = index > currentStep;

        return (
          <React.Fragment key={step.id}>
            {/* Step circle */}
            <div className="flex flex-col items-center shrink-0">
              <div
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors',
                  isCompleted && 'bg-primary border-primary text-primary-foreground',
                  isActive && 'bg-background border-primary text-primary',
                  isUpcoming && 'bg-background border-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              {/* Label — hidden on mobile */}
              <span
                className={cn(
                  'hidden sm:block mt-1 text-xs text-center max-w-[80px] truncate',
                  isActive && 'text-primary font-medium',
                  isCompleted && 'text-foreground',
                  isUpcoming && 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 mx-2 mt-[-12px] sm:mt-[-16px] transition-colors',
                  index < currentStep ? 'bg-primary' : 'bg-muted'
                )}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function StepWizard({
  steps,
  currentStep,
  title,
  children,
  isNextDisabled = false,
  hideBackOnFirst = true,
  open,
  onNext,
  onBack,
  onSkip,
  onCancel,
  nextLabel,
  isNextLoading = false,
  className,
}: StepWizardProps) {
  const activeStep = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;
  const showBack = !(isFirstStep && hideBackOnFirst);
  const showSkip = activeStep?.isOptional && !!onSkip;

  const defaultNextLabel = isLastStep ? 'Create Tenant' : 'Next';
  const resolvedNextLabel = nextLabel ?? defaultNextLabel;

  // Keyboard handler: Esc → cancel (handled by Radix Dialog natively)
  // Enter on Next is handled by the button's type / form submit

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2',
            'bg-background border border-border rounded-lg shadow-lg',
            'flex flex-col max-h-[90vh]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            className
          )}
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <DialogPrimitive.Title className="text-xl font-semibold text-foreground mb-4">
              {title}
            </DialogPrimitive.Title>
            <StepIndicator steps={steps} currentStep={currentStep} />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Step heading */}
            {activeStep && (
              <div className="mb-6">
                <h2 className="text-base font-semibold text-foreground">
                  Step {currentStep + 1}: {activeStep.label}
                  {activeStep.isOptional && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      (Optional)
                    </span>
                  )}
                </h2>
                {activeStep.description && (
                  <p className="text-sm text-muted-foreground mt-1">{activeStep.description}</p>
                )}
              </div>
            )}
            {children}
          </div>

          {/* Footer / Navigation */}
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
            {/* Left: Cancel */}
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={isNextLoading}
              type="button"
              aria-label="Cancel wizard"
            >
              Cancel
            </Button>

            {/* Right: Back / Skip / Next */}
            <div className="flex items-center gap-2">
              {showBack && (
                <Button variant="outline" onClick={onBack} disabled={isNextLoading} type="button">
                  Back
                </Button>
              )}
              {showSkip && (
                <Button
                  variant="outline"
                  onClick={onSkip}
                  disabled={isNextLoading}
                  type="button"
                  aria-label={`Skip ${activeStep?.label ?? 'step'}`}
                >
                  Skip
                </Button>
              )}
              <Button
                onClick={onNext}
                disabled={isNextDisabled || isNextLoading}
                type="button"
                aria-label={isLastStep ? 'Create tenant' : 'Next step'}
              >
                {isNextLoading ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-4 h-4 border-2 border-t-transparent border-current rounded-full animate-spin"
                      aria-hidden="true"
                    />
                    {resolvedNextLabel}
                  </span>
                ) : (
                  resolvedNextLabel
                )}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
