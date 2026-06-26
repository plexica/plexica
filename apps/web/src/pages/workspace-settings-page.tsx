// workspace-settings-page.tsx
// Form to edit workspace name/description.
// Settings Panel pattern: SettingsSection + SaveBar with isDirty.
// Dangerous actions delegated to WorkspaceDangerZone.

import { useEffect } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input, Textarea } from '@plexica/ui';

import { useWorkspace, useUpdateWorkspace } from '../hooks/use-workspaces.js';
import { useWorkspaceId } from '../hooks/use-workspace-params.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';
import { SettingsSection, SaveBar, useSaveStatus } from '../components/settings/settings-section.js';
import { WorkspaceDangerZone } from '../components/workspace/workspace-danger-zone.js';

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
      <SkeletonLoader variant="card" className="h-36" />
      <SkeletonLoader variant="card" className="h-24" />
    </div>
  );
}

export function WorkspaceSettingsPage(): JSX.Element {
  const intl = useIntl();
  const id = useWorkspaceId();
  const { saveStatus, markSaved } = useSaveStatus();
  const { data, isPending, isError, refetch } = useWorkspace(id);
  const { mutate: update, isPending: isSaving } = useUpdateWorkspace();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (data !== undefined) reset({ name: data.name, description: data.description ?? '' });
  }, [data, reset]);

  if (isPending) return <WorkspaceSettingsSkeleton />;
  if (isError || data === undefined) {
    return <div className="p-6"><PageError onRetry={() => void refetch()} /></div>;
  }

  function onSubmit(values: FormValues): void {
    const payload: { name: string; description?: string } = { name: values.name };
    if (values.description !== undefined && values.description !== '') {
      payload.description = values.description;
    }
    update({ id, payload }, {
      onSuccess: () => {
        reset(values); markSaved();
      },
    });
  }

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="workspace.edit.title" />
      </h1>

      <div className="max-w-2xl space-y-4">
        <SettingsSection
          title={<FormattedMessage id="workspace.edit.title" />}
        >
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Input
              label={intl.formatMessage({ id: 'workspace.create.name.label' })}
              {...(errors.name?.message !== undefined ? { error: errors.name.message } : {})}
              {...register('name')}
            />
            <Textarea
              label={intl.formatMessage({ id: 'workspace.create.description.label' })}
              {...register('description')}
            />
            <SaveBar
              isDirty={isDirty}
              isSaving={isSaving}
              saveStatus={saveStatus}
              saveLabel={<FormattedMessage id="workspace.edit.submit" />}
            />
          </form>
        </SettingsSection>

        <WorkspaceDangerZone workspaceId={id} status={data.status} />
      </div>
    </div>
  );
}
