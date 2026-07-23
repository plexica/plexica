import type { Contact, ContactFormData } from './types';

export interface CrmApiContext {
  apiBaseUrl: string;
  accessToken: string;
  tenantSlug: string;
  workspaceId: string;
}

async function request<T>(context: CrmApiContext, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${context.apiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${context.accessToken}`,
      'Content-Type': 'application/json',
      'X-Plexica-Workspace-Id': context.workspaceId,
      'X-Tenant-Slug': context.tenantSlug,
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.status === 204 ? undefined as T : res.json() as Promise<T>;
}

export function fetchContacts(context: CrmApiContext): Promise<Contact[]> {
  return request<Contact[]>(context, '/contacts');
}

export function fetchContact(context: CrmApiContext, id: string): Promise<Contact> {
  return request<Contact>(context, `/contacts/${id}`);
}

export function createContact(context: CrmApiContext, data: ContactFormData): Promise<Contact> {
  return request<Contact>(context, '/contacts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateContact(context: CrmApiContext, id: string, data: Partial<ContactFormData>): Promise<Contact> {
  return request<Contact>(context, `/contacts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteContact(context: CrmApiContext, id: string): Promise<void> {
  return request<void>(context, `/contacts/${id}`, { method: 'DELETE' });
}

export function fetchDealCount(context: CrmApiContext): Promise<{ count: number }> {
  return request<{ count: number }>(context, '/deals/count');
}
