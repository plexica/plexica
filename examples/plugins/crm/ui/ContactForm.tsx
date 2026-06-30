import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useIntl } from 'react-intl';
import { Button, Input, Textarea } from '@plexica/ui';

import type { Contact, ContactFormData } from './types';

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').or(z.literal('')),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

interface ContactFormProps {
  contact?: Contact;
  onSubmit: (data: ContactFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function ContactForm({ contact, onSubmit, onCancel, loading }: ContactFormProps): React.JSX.Element {
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
      aria-label={contact ? intl.formatMessage({ id: 'crm.form.editTitle' }) : intl.formatMessage({ id: 'crm.form.addTitle' })}
    >
      <Input
        label={intl.formatMessage({ id: 'crm.form.name' })}
        placeholder={intl.formatMessage({ id: 'crm.form.namePlaceholder' })}
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        label={intl.formatMessage({ id: 'crm.form.email' })}
        type="email"
        placeholder={intl.formatMessage({ id: 'crm.form.emailPlaceholder' })}
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label={intl.formatMessage({ id: 'crm.form.phone' })}
        type="tel"
        placeholder={intl.formatMessage({ id: 'crm.form.phonePlaceholder' })}
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Textarea
        label={intl.formatMessage({ id: 'crm.form.notes' })}
        placeholder={intl.formatMessage({ id: 'crm.form.notesPlaceholder' })}
        error={errors.notes?.message}
        {...register('notes')}
      />
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          {intl.formatMessage({ id: 'crm.form.cancel' })}
        </Button>
        <Button type="submit" loading={loading}>
          {intl.formatMessage({ id: contact ? 'crm.form.save' : 'crm.form.add' })}
        </Button>
      </div>
    </form>
  );
}
