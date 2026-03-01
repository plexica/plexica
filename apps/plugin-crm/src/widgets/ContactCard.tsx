// apps/plugin-crm/src/widgets/ContactCard.tsx
//
// T010-3.5: Reference widget implementation for the CRM plugin.
//
// Self-contained widget that fetches contact data from the CRM API and
// renders a compact card. Exported via Module Federation as './ContactCard'
// so host applications can embed it using WidgetLoader.
//
// Props intentionally serializable (no function props) — per widget
// contract documented in docs/PLUGIN_DEVELOPMENT.md.

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContactCardProps {
  /** CRM contact identifier to display. */
  contactId: string;
}

// ---------------------------------------------------------------------------
// Data fetcher
// ---------------------------------------------------------------------------

async function fetchContact(contactId: string): Promise<Contact> {
  const response = await axios.get<Contact>(`/api/v1/crm/contacts/${contactId}`);
  return response.data;
}

// ---------------------------------------------------------------------------
// ContactCard widget
// ---------------------------------------------------------------------------

export function ContactCard({ contactId }: ContactCardProps) {
  const {
    data: contact,
    isLoading,
    isError,
  } = useQuery<Contact>({
    queryKey: ['contact', contactId],
    queryFn: () => fetchContact(contactId),
  });

  if (isLoading) {
    return (
      <div
        className="animate-pulse bg-muted rounded-lg p-4 space-y-2"
        aria-label="Loading contact"
        aria-busy="true"
      >
        <div className="h-5 bg-muted-foreground/20 rounded w-1/2" />
        <div className="h-4 bg-muted-foreground/20 rounded w-3/4" />
        <div className="h-4 bg-muted-foreground/20 rounded w-2/3" />
      </div>
    );
  }

  if (isError || !contact) {
    return <p className="text-sm text-muted-foreground p-4">Contact not found</p>;
  }

  return (
    <div className="bg-card border rounded-lg p-4 space-y-1">
      <h3 className="text-lg font-semibold text-card-foreground">{contact.name}</h3>
      <p className="text-sm text-muted-foreground">{contact.email}</p>
      {contact.phone && <p className="text-sm text-muted-foreground">{contact.phone}</p>}
    </div>
  );
}

export default ContactCard;
