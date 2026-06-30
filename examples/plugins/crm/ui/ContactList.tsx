import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button, ConfirmDialog } from '@plexica/ui';

import type { Contact, ContactFormData } from './types';
import { fetchContacts, createContact, updateContact, deleteContact } from './api';
import { ContactForm } from './ContactForm';

function SkeletonRows(): React.JSX.Element {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 4 }).map((_, j) => (
            <TableCell key={j}>
              <div className="h-4 w-full animate-pulse rounded bg-neutral-200" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function ContactList(): React.JSX.Element {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const { data: contacts, isLoading, isError, refetch } = useQuery<Contact[]>({
    queryKey: ['crm', 'contacts'],
    queryFn: fetchContacts,
  });

  const createMutation = useMutation({
    mutationFn: (data: ContactFormData) => createContact(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'contacts'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ContactFormData> }) => updateContact(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'contacts'] });
      setEditingContact(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'contacts'] });
      setDeleting(null);
    },
  });

  function handleEdit(contact: Contact): void { setEditingContact(contact); setShowForm(true); }

  function handleFormSubmit(data: ContactFormData): Promise<void> {
    if (editingContact) return updateMutation.mutateAsync({ id: editingContact.id, data });
    return createMutation.mutateAsync(data);
  }

  function handleCancel(): void { setShowForm(false); setEditingContact(null); }

  if (isLoading) {
    return (
      <Table aria-label={intl.formatMessage({ id: 'crm.list.title' })}>
        <TableHeader>
          <TableRow>
            <TableHead>{intl.formatMessage({ id: 'crm.list.name' })}</TableHead>
            <TableHead>{intl.formatMessage({ id: 'crm.list.email' })}</TableHead>
            <TableHead>{intl.formatMessage({ id: 'crm.list.phone' })}</TableHead>
            <TableHead><span className="sr-only">{intl.formatMessage({ id: 'crm.list.actions' })}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody><SkeletonRows /></TableBody>
      </Table>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-error bg-error-light p-8 text-center" role="alert">
        <p className="text-sm text-error-dark">{intl.formatMessage({ id: 'crm.list.error' })}</p>
        <Button variant="outline" onClick={() => refetch()} aria-label={intl.formatMessage({ id: 'crm.list.retry' })}>
          {intl.formatMessage({ id: 'crm.list.retry' })}
        </Button>
      </div>
    );
  }

  if (!contacts || contacts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm text-neutral-500">{intl.formatMessage({ id: 'crm.list.empty' })}</p>
          <Button
            variant="primary"
            onClick={() => setShowForm(true)}
            aria-label={intl.formatMessage({ id: 'crm.list.addContact' })}
          >
            {intl.formatMessage({ id: 'crm.list.addContact' })}
          </Button>
        </div>
        {showForm && (
          <ContactForm onSubmit={handleFormSubmit} onCancel={handleCancel} loading={createMutation.isPending} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">{intl.formatMessage({ id: 'crm.list.title' })}</h2>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { setEditingContact(null); setShowForm(true); }}
          aria-label={intl.formatMessage({ id: 'crm.list.addContact' })}
        >
          {intl.formatMessage({ id: 'crm.list.addContact' })}
        </Button>
      </div>

      {showForm && (
        <ContactForm
          contact={editingContact ?? undefined}
          onSubmit={handleFormSubmit}
          onCancel={handleCancel}
          loading={createMutation.isPending || updateMutation.isPending}
        />
      )}

      <div role="region" aria-label={intl.formatMessage({ id: 'crm.list.title' })}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{intl.formatMessage({ id: 'crm.list.name' })}</TableHead>
              <TableHead>{intl.formatMessage({ id: 'crm.list.email' })}</TableHead>
              <TableHead>{intl.formatMessage({ id: 'crm.list.phone' })}</TableHead>
              <TableHead><span className="sr-only">{intl.formatMessage({ id: 'crm.list.actions' })}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="font-medium">{contact.name}</TableCell>
                <TableCell>{contact.email}</TableCell>
                <TableCell>{contact.phone}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(contact)}
                      aria-label={intl.formatMessage({ id: 'crm.list.edit' }, { name: contact.name })}
                    >
                      {intl.formatMessage({ id: 'crm.list.edit' })}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(contact)}
                      aria-label={intl.formatMessage({ id: 'crm.list.delete' }, { name: contact.name })}
                    >
                      {intl.formatMessage({ id: 'crm.list.delete' })}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title={intl.formatMessage({ id: 'crm.delete.title' })}
        description={intl.formatMessage({ id: 'crm.delete.description' }, { name: deleting?.name ?? '' })}
        confirmLabel={intl.formatMessage({ id: 'crm.delete.confirm' })}
        cancelLabel={intl.formatMessage({ id: 'crm.delete.cancel' })}
        variant="destructive"
        onConfirm={() => { if (deleting) deleteMutation.mutate(deleting.id); }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
