import type { Contact, ContactFormData } from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchContacts(): Promise<Contact[]> {
  return request<Contact[]>('/contacts');
}

export function fetchContact(id: string): Promise<Contact> {
  return request<Contact>(`/contacts/${id}`);
}

export function createContact(data: ContactFormData): Promise<Contact> {
  return request<Contact>('/contacts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateContact(id: string, data: Partial<ContactFormData>): Promise<Contact> {
  return request<Contact>(`/contacts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteContact(id: string): Promise<void> {
  return request<void>(`/contacts/${id}`, { method: 'DELETE' });
}

export function fetchDealCount(): Promise<{ count: number }> {
  return request<{ count: number }>('/deals/count');
}
