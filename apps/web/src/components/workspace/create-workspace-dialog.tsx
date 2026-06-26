// create-workspace-dialog.tsx
// Dialog form for creating a new workspace.
// Modal Flow pattern: error state inline, form reset on close, server error display.
// Selects controlled via RHF <Controller> for reliable reset on close.

import { useState } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Input,
  Textarea,
  Select,
  DialogRoot,
  DialogContent,
  DialogTitle,
} from '@plexica/ui';

import { useCreateWorkspace, useWorkspaces } from '../../hooks/use-workspaces.js';
import { useWorkspaceTemplates } from '../../hooks/use-workspace-templates.js';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parentId: z.string().optional(),
  templateId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps): JSX.Element {
  const intl = useIntl();
  const [serverError, setServerError] = useState<string | null>(null);
  const { mutate, isPending } = useCreateWorkspace();
  // Lazy fetch: only hit the API when the dialog is actually open
  const { data: workspacesData } = useWorkspaces({ limit: 100 }, { enabled: open });
  const { data: templatesData } = useWorkspaceTemplates({ enabled: open });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function handleOpenChange(newOpen: boolean): void {
    if (!newOpen) {
      reset();
      setServerError(null);
    }
    onOpenChange(newOpen);
  }

  function onSubmit(values: FormValues): void {
    setServerError(null);
    const payload = {
      name: values.name,
      ...(values.description ? { description: values.description } : {}),
      ...(values.parentId ? { parentId: values.parentId } : {}),
      ...(values.templateId ? { templateId: values.templateId } : {}),
    };
    mutate(payload, {
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
      onError: () => {
        setServerError(intl.formatMessage({ id: 'common.error' }));
      },
    });
  }

  const workspaceOptions = (workspacesData?.data ?? []).map((w) => ({
    value: w.id,
    label: w.name,
  }));

  const templateOptions = (templatesData ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));

  const selectPlaceholder = intl.formatMessage({ id: 'common.none' });

  return (
    <DialogRoot open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeLabel={intl.formatMessage({ id: 'common.cancel' })}>
        <DialogTitle>
          <FormattedMessage id="workspace.create.title" />
        </DialogTitle>

        <form
          onSubmit={(e) => { void handleSubmit(onSubmit)(e); }}
          className="mt-4 space-y-4"
          noValidate
        >
          <Input
            label={intl.formatMessage({ id: 'workspace.create.name.label' })}
            {...(errors.name?.message !== undefined ? { error: errors.name.message } : {})}
            {...register('name')}
          />
          <Textarea
            label={intl.formatMessage({ id: 'workspace.create.description.label' })}
            {...register('description')}
          />
          {workspaceOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700">
                <FormattedMessage id="workspace.create.parent.label" />
              </label>
              <Controller
                name="parentId"
                control={control}
                render={({ field }) => (
                  <Select
                    options={workspaceOptions}
                    placeholder={selectPlaceholder}
                    {...(field.value !== undefined ? { value: field.value } : {})}
                    onValueChange={(v) => field.onChange(v)}
                    aria-label={intl.formatMessage({ id: 'workspace.create.parent.label' })}
                  />
                )}
              />
            </div>
          )}
          {templateOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700">
                <FormattedMessage id="workspace.create.template.label" />
              </label>
              <Controller
                name="templateId"
                control={control}
                render={({ field }) => (
                  <Select
                    options={templateOptions}
                    placeholder={selectPlaceholder}
                    {...(field.value !== undefined ? { value: field.value } : {})}
                    onValueChange={(v) => field.onChange(v)}
                    aria-label={intl.formatMessage({ id: 'workspace.create.template.label' })}
                  />
                )}
              />
            </div>
          )}

          {serverError !== null && (
            <p role="alert" className="text-sm text-error">
              {serverError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              <FormattedMessage id="common.cancel" />
            </Button>
            <Button type="submit" loading={isPending}>
              <FormattedMessage id="workspace.create.submit" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
