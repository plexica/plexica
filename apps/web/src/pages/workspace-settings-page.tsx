// workspace-settings-page.tsx
// Form to edit workspace name/description, and archive/restore actions.

import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Textarea, ConfirmDialog } from '@plexica/ui';

import {
  useWorkspace,
  useUpdateWorkspace,
  useDeleteWorkspace,
  useRestoreWorkspace,
} from '../hooks/use-workspaces.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

function useWorkspaceId(): string {
  const params = useParams({ strict: false });
  return (params as Record<string, string>).workspaceId ?? '';
}

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function WorkspaceSettingsSkeleton(): JSX.Element {
  return (
    <div className="space-y-8 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <SkeletonLoader className="h-8 w-40" />
      <div className="max-w-lg space-y-4">
        <SkeletonLoader variant="card" className="h-10" />
        <SkeletonLoader variant="card" className="h-20" />
        <SkeletonLoader className="h-9 w-28 rounded-md" />
      </div>
      <hr className="border-neutral-200" />
      <SkeletonLoader className="h-9 w-32 rounded-md" />
    </div>
  );
}

export function WorkspaceSettingsPage(): JSX.Element {
  const intl = useIntl();
  const id = useWorkspaceId();
  const { data, isPending, isError, refetch } = useWorkspace(id);
  const { mutate: update, isPending: isSaving } = useUpdateWorkspace();
  const { mutate: archive, isPending: isArchiving } = useDeleteWorkspace();
  const { mutate: restore, isPending: isRestoring } = useRestoreWorkspace();
  const [showArchive, setShowArchive] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (data !== undefined) {
      reset({
        name: data.name,
        description: data.description ?? '',
      });
    }
  }, [data, reset]);

  if (isPending) return <WorkspaceSettingsSkeleton />;
  if (isError || data === undefined) {
    return (
      <div className="p-6">
        <PageError onRetry={() => void refetch()} />
      </div>
    );
  }

  const ws = data;

  function onSubmit(values: FormValues): void {
    const payload: { name: string; description?: string } = { name: values.name };
    if (values.description !== undefined && values.description !== '') {
      payload.description = values.description;
    }
    update({ id, payload });
  }

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="workspace.edit.title" />
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-4" noValidate>
        <Input
          label={intl.formatMessage({ id: 'workspace.create.name.label' })}
          {...(errors.name?.message !== undefined ? { error: errors.name.message } : {})}
          {...register('name')}
        />
        <Textarea
          label={intl.formatMessage({ id: 'workspace.create.description.label' })}
          {...register('description')}
        />
        <Button type="submit" loading={isSaving}>
          <FormattedMessage id="workspace.edit.submit" />
        </Button>
      </form>

      <hr className="border-neutral-200" />

      {/* Danger Zone */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-neutral-900">
          <FormattedMessage id="workspace.dangerZone.title" />
        </h2>
        <div className="rounded-lg border border-error-light bg-white p-4">
          {archiveError !== null && (
            <p role="alert" className="mb-3 text-sm text-error">
              {archiveError}
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-900">
                {ws.status === 'active'
                  ? intl.formatMessage({ id: 'workspace.delete.confirm.title' })
                  : intl.formatMessage({ id: 'workspace.restore.confirm.title' })}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {ws.status === 'active'
                  ? intl.formatMessage({ id: 'workspace.delete.confirm.description' })
                  : intl.formatMessage({ id: 'workspace.restore.confirm.description' })}
              </p>
            </div>
            {ws.status === 'active' ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { setArchiveError(null); setShowArchive(true); }}
                disabled={isArchiving}
              >
                <FormattedMessage id="common.delete" />
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setArchiveError(null); setShowRestore(true); }}
                disabled={isRestoring}
              >
                <FormattedMessage id="common.restore" />
              </Button>
            )}
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={showArchive}
        onOpenChange={setShowArchive}
        title={intl.formatMessage({ id: 'workspace.delete.confirm.title' })}
        description={intl.formatMessage({ id: 'workspace.delete.confirm.description' })}
        confirmLabel={intl.formatMessage({ id: 'common.delete' })}
        cancelLabel={intl.formatMessage({ id: 'common.cancel' })}
        variant="destructive"
        onConfirm={() =>
          archive(id, {
            onSuccess: () => setShowArchive(false),
            onError: () => {
              setShowArchive(false);
              setArchiveError(intl.formatMessage({ id: 'common.error' }));
            },
          })
        }
        loading={isArchiving}
      />

      <ConfirmDialog
        open={showRestore}
        onOpenChange={setShowRestore}
        title={intl.formatMessage({ id: 'workspace.restore.confirm.title' })}
        description={intl.formatMessage({ id: 'workspace.restore.confirm.description' })}
        confirmLabel={intl.formatMessage({ id: 'common.restore' })}
        cancelLabel={intl.formatMessage({ id: 'common.cancel' })}
        onConfirm={() =>
          restore(id, {
            onSuccess: () => setShowRestore(false),
            onError: () => {
              setShowRestore(false);
              setArchiveError(intl.formatMessage({ id: 'common.error' }));
            },
          })
        }
        loading={isRestoring}
      />
    </div>
  );
}
