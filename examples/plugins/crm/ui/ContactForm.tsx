import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useIntl } from 'react-intl';
import { Button, Input, Textarea } from '@plexica/ui';

import type { Contact, ContactFormData } from './types';

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').or(z.literal('')),
  phone: z.string(),
  notes: z.string(),
});

interface ContactFormProps {
  contact?: Contact;
  onSubmit: (data: ContactFormData) => Promise<unknown>;
  onCancel: () => void;
  loading?: boolean;
}

export function ContactForm({
  contact,
  onSubmit,
  onCancel,
  loading = false,
}: ContactFormProps): React.JSX.Element {
  const intl = useIntl();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: contact
      ? { name: contact.name, email: contact.email, phone: contact.phone, notes: contact.notes }
      : { name: '', email: '', phone: '', notes: '' },
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4"
      aria-label={
        contact
          ? intl.formatMessage({ id: 'plugin.crm.form.editTitle', defaultMessage: 'Edit Contact' })
          : intl.formatMessage({ id: 'plugin.crm.form.addTitle', defaultMessage: 'Add Contact' })
      }
    >
      <Input
        label={intl.formatMessage({ id: 'plugin.crm.form.name', defaultMessage: 'Name' })}
        placeholder={intl.formatMessage({
          id: 'plugin.crm.form.namePlaceholder',
          defaultMessage: 'Ada Lovelace',
        })}
        {...(errors.name?.message ? { error: errors.name.message } : {})}
        {...register('name')}
      />
      <Input
        label={intl.formatMessage({ id: 'plugin.crm.form.email', defaultMessage: 'Email' })}
        type="email"
        placeholder={intl.formatMessage({
          id: 'plugin.crm.form.emailPlaceholder',
          defaultMessage: 'ada@example.com',
        })}
        {...(errors.email?.message ? { error: errors.email.message } : {})}
        {...register('email')}
      />
      <Input
        label={intl.formatMessage({ id: 'plugin.crm.form.phone', defaultMessage: 'Phone' })}
        type="tel"
        placeholder={intl.formatMessage({
          id: 'plugin.crm.form.phonePlaceholder',
          defaultMessage: '+1 555 0100',
        })}
        {...(errors.phone?.message ? { error: errors.phone.message } : {})}
        {...register('phone')}
      />
      <Textarea
        label={intl.formatMessage({ id: 'plugin.crm.form.notes', defaultMessage: 'Notes' })}
        placeholder={intl.formatMessage({
          id: 'plugin.crm.form.notesPlaceholder',
          defaultMessage: 'Relationship notes',
        })}
        {...(errors.notes?.message ? { error: errors.notes.message } : {})}
        {...register('notes')}
      />
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          {intl.formatMessage({ id: 'plugin.crm.form.cancel', defaultMessage: 'Cancel' })}
        </Button>
        <Button type="submit" loading={loading}>
          {intl.formatMessage(
            contact
              ? { id: 'plugin.crm.form.save', defaultMessage: 'Save Contact' }
              : { id: 'plugin.crm.form.add', defaultMessage: 'Add Contact' }
          )}
        </Button>
      </div>
    </form>
  );
}
