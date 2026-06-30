export interface Contact {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  workspaceId: string;
  contactId: string;
  title: string;
  value: number;
  stage: string;
  createdAt: string;
  updatedAt: string;
}

export const contactsStore = new Map<string, Map<string, Contact>>();
export const dealsStore = new Map<string, Map<string, Deal>>();
