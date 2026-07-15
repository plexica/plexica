// plugin-review-dialog.tsx — Approve/reject dialog for pending plugins (S5-803).
// Form via react-hook-form + Zod (Rule 3). Radix Dialog (no window.confirm).

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Button,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  Textarea,
} from '@plexica/ui';

import type { Plugin } from '../../types/admin-types.js';

const NOTES_MAX = 500;

const reviewSchema = z.object({
  notes: z.string().max(NOTES_MAX),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

interface PluginReviewDialogProps {
  plugin: Plugin | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (decision: 'approve' | 'reject', notes: string) => void;
  loading: boolean;
}

export function PluginReviewDialog({
  plugin,
  open,
  onOpenChange,
  onSubmit,
  loading,
}: PluginReviewDialogProps): JSX.Element {
  const intl = useIntl();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { notes: '' },
  });

  function handleOpenChange(next: boolean): void {
    if (!next) reset({ notes: '' });
    onOpenChange(next);
  }

  function submit(decision: 'approve' | 'reject'): void {
    void handleSubmit((values) => {
      onSubmit(decision, values.notes.trim());
    })();
  }

  const notesError = errors.notes?.message;

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeLabel={intl.formatMessage({ id: 'plugins.review.cancel' })}>
        <DialogTitle>
          <FormattedMessage id="plugins.review.title" values={{ name: plugin?.name ?? '' }} />
        </DialogTitle>
        <DialogDescription>
          <FormattedMessage id="plugins.review.description" />
        </DialogDescription>

        {plugin !== null && (
          <dl className="mt-4 grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-neutral-500"><FormattedMessage id="plugins.columns.slug" /></dt>
            <dd className="text-neutral-900">{plugin.slug}</dd>
            <dt className="text-neutral-500"><FormattedMessage id="plugins.columns.version" /></dt>
            <dd className="text-neutral-900">{plugin.version}</dd>
            <dt className="text-neutral-500"><FormattedMessage id="plugins.columns.installed" /></dt>
            <dd className="text-neutral-900">{plugin.installedCount}</dd>
            {plugin.description !== '' && (
              <>
                <dt className="text-neutral-500"><FormattedMessage id="plugins.review.descriptionLabel" /></dt>
                <dd className="text-neutral-700">{plugin.description}</dd>
              </>
            )}
          </dl>
        )}

        <form className="mt-4 space-y-3" onSubmit={(e) => e.preventDefault()}>
          <Textarea
            label={intl.formatMessage({ id: 'plugins.review.notes' })}
            rows={3}
            maxLength={NOTES_MAX}
            {...register('notes')}
            {...(typeof notesError === 'string' ? { error: notesError } : {})}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              <FormattedMessage id="plugins.review.cancel" />
            </Button>
            <Button variant="destructive" onClick={() => submit('reject')} loading={loading}>
              <FormattedMessage id="plugins.review.reject" />
            </Button>
            <Button variant="primary" onClick={() => submit('approve')} loading={loading}>
              <FormattedMessage id="plugins.review.approve" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
