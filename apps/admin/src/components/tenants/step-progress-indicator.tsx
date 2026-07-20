// step-progress-indicator.tsx — StepProgressIndicator (design-spec Component 4).
// Horizontal numbered stepper with connecting lines. Completed steps show a
// green check, the current step is highlighted, future steps are gray.
// Rendered as an ordered list with aria-current="step" on the active step.

import { Check } from 'lucide-react';
import { cn } from '@plexica/ui';

interface StepProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  labels: string[];
}

type StepState = 'done' | 'current' | 'pending';

function stepState(index: number, currentStep: number): StepState {
  if (index < currentStep - 1) return 'done';
  if (index === currentStep - 1) return 'current';
  return 'pending';
}

const CIRCLE_CLASS: Record<StepState, string> = {
  done: 'bg-green-600 text-white border-green-600',
  current: 'bg-primary-600 text-white border-primary-600 ring-2 ring-primary-500 ring-offset-2',
  pending: 'bg-white text-neutral-400 border-neutral-300',
};

const LABEL_CLASS: Record<StepState, string> = {
  done: 'text-neutral-700',
  current: 'text-neutral-900 font-semibold',
  pending: 'text-neutral-400',
};

const LINE_DONE = 'bg-green-600';
const LINE_PENDING = 'bg-neutral-200';

export function StepProgressIndicator({
  currentStep,
  totalSteps,
  labels,
}: StepProgressIndicatorProps): JSX.Element {
  return (
    <ol
      className="flex items-center"
      aria-label="Provisioning progress"
      aria-live="polite"
    >
      {Array.from({ length: totalSteps }).map((_, i) => {
        const state = stepState(i, currentStep);
        const isLast = i === totalSteps - 1;
        return (
          <li
            key={i}
            className="flex items-center"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border text-sm',
                  CIRCLE_CLASS[state]
                )}
              >
                {state === 'done' ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  i + 1
                )}
                <span className="sr-only">
                  {state === 'done' ? 'completed' : state === 'current' ? 'current' : 'pending'}
                </span>
              </span>
              <span className={cn('text-xs', LABEL_CLASS[state])}>{labels[i]}</span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  'mx-2 h-0.5 w-16',
                  i < currentStep - 1 ? LINE_DONE : LINE_PENDING
                )}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
