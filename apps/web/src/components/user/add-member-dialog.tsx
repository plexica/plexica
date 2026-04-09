// add-member-dialog.tsx
// Dialog form for inviting a user to a workspace.
// Uses react-hook-form + Zod. All strings via react-intl.

import { useIntl, FormattedMessage } from 'react-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Select, DialogRoot, DialogContent, DialogTitle } from '@plexica/ui';

import { useSendInvite } from '../../hooks/use-invitations.js';

interface AddMemberDialogProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const schema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']),
});

type FormValues = z.infer<typeof schema>;

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

export function AddMemberDialog({
  workspaceId,
  open,
  onOpenChange,
}: AddMemberDialogProps): JSX.Element {
  const intl = useIntl();
  const { mutate, isPending } = useSendInvite();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'member' },
  });

  function onSubmit(values: FormValues): void {
    mutate(
      { email: values.email, workspaceId, role: values.role },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={intl.formatMessage({ id: 'common.cancel' })}>
        <DialogTitle>
          <FormattedMessage id="members.invite" />
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
          <Input
            type="email"
            label="Email"
            {...(errors.email?.message !== undefined ? { error: errors.email.message } : {})}
            {...register('email')}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700">
              <FormattedMessage id="members.role.member" />
            </label>
            <Select
              options={roleOptions}
              value="member"
              onValueChange={(v) => setValue('role', v as 'admin' | 'member' | 'viewer')}
              aria-label={intl.formatMessage({ id: 'members.role.member' })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              <FormattedMessage id="common.cancel" />
            </Button>
            <Button type="submit" loading={isPending}>
              <FormattedMessage id="members.invite" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
