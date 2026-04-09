// workspace-settings-page.tsx
// Form to edit workspace name/description, and archive/restore actions.

import { useEffect } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Textarea, ConfirmDialog } from '@plexica/ui';
import { useState } from 'react';

import {
  useWorkspace,
  useUpdateWorkspace,
  useDeleteWorkspace,
  useRestoreWorkspace,
} from '../hooks/use-workspaces.js';

function useWorkspaceId(): string {
  const params = useParams({ strict: false });
  return (params as Record<string, string>).workspaceId ?? '';
}

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function WorkspaceSettingsPage(): JSX.Element {
  const intl = useIntl();
  const id = useWorkspaceId();
  const { data, isPending, isError } = useWorkspace(id);
  const { mutate: update, isPending: isSaving } = useUpdateWorkspace();
  const { mutate: archive, isPending: isArchiving } = useDeleteWorkspace();
  const { mutate: restore, isPending: isRestoring } = useRestoreWorkspace();
  const [showArchive, setShowArchive] = useState(false);
  const [showRestore, setShowRestore] = useState(false);

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

  if (isPending)
    return (
      <div className="p-6" aria-live="polite">
        <FormattedMessage id="common.loading" />
      </div>
    );
  if (isError || data === undefined)
    return (
      <div className="p-6" role="alert">
        <FormattedMessage id="common.error" />
      </div>
    );

  // Backend returns WorkspaceDetail directly (no { data } wrapper)
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

      <div className="space-y-3">
        {ws.status === 'active' ? (
          <Button variant="destructive" onClick={() => setShowArchive(true)} disabled={isArchiving}>
            <FormattedMessage id="common.delete" />
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setShowRestore(true)} disabled={isRestoring}>
            <FormattedMessage id="common.restore" />
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={showArchive}
        onOpenChange={setShowArchive}
        title={intl.formatMessage({ id: 'workspace.delete.confirm.title' })}
        description={intl.formatMessage({ id: 'workspace.delete.confirm.description' })}
        confirmLabel={intl.formatMessage({ id: 'common.delete' })}
        cancelLabel={intl.formatMessage({ id: 'common.cancel' })}
        variant="destructive"
        onConfirm={() => archive(id, { onSuccess: () => setShowArchive(false) })}
        loading={isArchiving}
      />

      <ConfirmDialog
        open={showRestore}
        onOpenChange={setShowRestore}
        title={intl.formatMessage({ id: 'workspace.restore.confirm.title' })}
        description={intl.formatMessage({ id: 'workspace.restore.confirm.description' })}
        confirmLabel={intl.formatMessage({ id: 'common.restore' })}
        cancelLabel={intl.formatMessage({ id: 'common.cancel' })}
        onConfirm={() => restore(id, { onSuccess: () => setShowRestore(false) })}
        loading={isRestoring}
      />
    </div>
  );
}
