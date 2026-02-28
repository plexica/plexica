// apps/super-admin/src/components/plugins/PluginInstallProgress.tsx
//
// T004-29: Plugin install progress panel.
//
// Displays a 6-step progress panel while a plugin is being installed.
// Based on design-spec.md Screen 2 wireframe.
//
// States:
//   installing → step list with live step progress, elapsed timer, Cancel button
//   complete   → all steps green, success toast, "Enable now?" button
//   failed     → failed step with error panel, Retry + Back to Registry buttons
//   cancelled  → (exits immediately, caller handles navigation)
//
// ARIA (design-spec.md Screen 2 Accessibility):
//   Container: role="region" aria-label="Plugin installation progress"
//   Step list:  role="log"   aria-live="polite"
//   Each step:  role="listitem" (rendered by InstallStep)
//   Error:      role="alert" (rendered by InstallStep / inline)
//   Elapsed:    aria-live="off" (decorative)

import { useEffect } from 'react';
import { Card, Button } from '@plexica/ui';
import { useInstallProgress } from '@/hooks/useInstallProgress';
import { useToast } from '@/hooks/use-toast';
import { InstallStep } from './InstallStep';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PluginInstallProgressProps {
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
  onComplete: () => void;
  onCancel: () => void;
  onRetry?: () => void;
  /** Override poll interval for tests (ms) */
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PluginInstallProgress({
  pluginId,
  pluginName,
  pluginVersion,
  onComplete,
  onCancel,
  onRetry,
  pollIntervalMs,
}: PluginInstallProgressProps) {
  const { toast } = useToast();

  const { steps, overallStatus, elapsedLabel, cancel, retry } = useInstallProgress({
    pluginId,
    onComplete,
    onCancel,
    pollIntervalMs,
  });

  // Show success toast when installation completes
  useEffect(() => {
    if (overallStatus === 'complete') {
      toast({
        variant: 'success',
        title: `${pluginName} installed successfully.`,
        description: 'You can now enable it for tenants.',
      });
    }
  }, [overallStatus, pluginName, toast]);

  // Derive failed step (if any)
  const failedStep = steps.find((s) => s.state === 'failed');

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section role="region" aria-label="Plugin installation progress" className="w-full">
      <Card className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl" aria-hidden="true">
                🧩
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                {overallStatus === 'complete'
                  ? `${pluginName} v${pluginVersion}`
                  : `Installing ${pluginName} v${pluginVersion}`}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {overallStatus === 'installing' && 'Installing...'}
              {overallStatus === 'complete' && 'Installation complete.'}
              {overallStatus === 'failed' && 'Installation failed.'}
            </p>
          </div>

          {/* Cancel button — only shown while installing */}
          {overallStatus === 'installing' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={cancel}
              className="text-destructive hover:text-destructive shrink-0"
            >
              Cancel Installation
            </Button>
          )}
        </div>

        {/* Step list */}
        <div role="log" aria-live="polite" aria-label="Installation steps" className="mb-4">
          <ul className="divide-y divide-border">
            {steps.map((step) => (
              <InstallStep key={step.number} step={step} />
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          {/* Elapsed timer — decorative, aria-live="off" */}
          <p className="text-xs text-muted-foreground" aria-live="off" aria-label="Elapsed time">
            {elapsedLabel}
          </p>

          {/* Action buttons — contextual per status */}
          <div className="flex gap-2">
            {overallStatus === 'complete' && (
              <Button size="sm" onClick={onComplete}>
                Enable now?
              </Button>
            )}

            {overallStatus === 'failed' && (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    retry();
                    onRetry?.();
                  }}
                >
                  Retry Installation
                </Button>
                <Button variant="outline" size="sm" onClick={onCancel}>
                  Back to Registry
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Announce to screen readers when all steps are done */}
        {overallStatus === 'complete' && (
          <p className="sr-only" aria-live="polite">
            All steps complete. {pluginName} installed successfully.
          </p>
        )}

        {/* Error summary for screen readers */}
        {failedStep && (
          <p className="sr-only" aria-live="assertive">
            Alert: {failedStep.name} failed — {failedStep.errorMessage}
          </p>
        )}
      </Card>
    </section>
  );
}
