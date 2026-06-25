// settings-section.tsx
// Layout wrapper implementing the Settings Panel pattern.
// Provides: card container, section header (title + description), content slot.
// SaveBar handles the unsaved-changes indicator + save button + success feedback.
// Pattern: idle → editing (isDirty) → saving → saved (2s) → idle

import type { ReactNode } from 'react';
import { FormattedMessage } from 'react-intl';
import { cn } from '@plexica/ui';
import { Button } from '@plexica/ui';

// ─── SettingsSection ────────────────────────────────────────────────────────

interface SettingsSectionProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  description,
  children,
  className,
}: SettingsSectionProps): JSX.Element {
  return (
    <section className={cn('rounded-lg border border-neutral-200 bg-white', className)}>
      <div className="border-b border-neutral-200 px-6 py-4">
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        {description !== undefined && (
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

// ─── SaveBar ────────────────────────────────────────────────────────────────
// Renders at the bottom of a settings form.
// isDirty: true when form has unsaved changes (form.formState.isDirty or manual).
// saveStatus: 'saved' shown for 2s after a successful mutation, then caller resets to 'idle'.

interface SaveBarProps {
  isDirty: boolean;
  isSaving: boolean;
  saveStatus: 'idle' | 'saved';
  saveLabel?: ReactNode;
  className?: string;
}

export function SaveBar({
  isDirty,
  isSaving,
  saveStatus,
  saveLabel,
  className,
}: SaveBarProps): JSX.Element {
  const label = saveLabel ?? <FormattedMessage id="common.save" />;

  return (
    <div
      className={cn(
        'mt-4 flex items-center justify-end gap-3 border-t border-neutral-100 pt-4',
        className,
      )}
    >
      {/* Unsaved changes indicator */}
      {isDirty && !isSaving && saveStatus === 'idle' && (
        <p className="mr-auto text-xs text-warning">
          <FormattedMessage id="settings.unsavedChanges" />
        </p>
      )}
      {/* Success feedback */}
      {saveStatus === 'saved' && (
        <p className="mr-auto text-xs text-success" role="status">
          <FormattedMessage id="settings.saved" />
        </p>
      )}

      <Button type="submit" loading={isSaving} disabled={!isDirty && saveStatus !== 'saved'}>
        {label}
      </Button>
    </div>
  );
}
