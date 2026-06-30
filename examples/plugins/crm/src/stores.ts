export interface Contact {
  id: string;
  workspaceId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  workspaceId: string;
  contactId: string | null;
  title: string;
  value: number;
  stage: string;
  createdAt: string;
  updatedAt: string;
}
