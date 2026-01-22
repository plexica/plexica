/**
 * Contacts Service (M2.3 Task 10)
 *
 * In-memory service for managing contacts
 */

import type {
  Contact,
  CreateContactInput,
  UpdateContactInput,
  ListQueryParams,
} from '../types/index.js';

export class ContactsService {
  private contacts: Map<string, Contact> = new Map();
  private idCounter = 1;

  constructor() {
    // Add some sample data
    this.seedData();
  }

  /**
   * Seed with sample contacts
   */
  private seedData() {
    const sampleContacts: CreateContactInput[] = [
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@acme.com',
        phone: '+1-555-0101',
        company: 'Acme Corp',
        position: 'CEO',
        tags: ['vip', 'enterprise'],
        notes: 'Key decision maker',
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@techco.com',
        phone: '+1-555-0102',
        company: 'TechCo Inc',
        position: 'CTO',
        tags: ['technical', 'enterprise'],
        notes: 'Technical decision maker',
      },
      {
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob.j@startup.io',
        phone: '+1-555-0103',
        company: 'Startup.io',
        position: 'Founder',
        tags: ['startup', 'early-stage'],
        notes: 'Looking for SaaS solutions',
      },
      {
        firstName: 'Alice',
        lastName: 'Williams',
        email: 'alice.w@global.com',
        phone: '+1-555-0104',
        company: 'Global Industries',
        position: 'VP Sales',
        tags: ['vip', 'international'],
        notes: 'Global account',
      },
    ];

    for (const input of sampleContacts) {
      this.create(input);
    }
  }

  /**
   * List all contacts with optional filtering
   */
  list(params: ListQueryParams = {}): { contacts: Contact[]; total: number } {
    const { skip = 0, take = 50, search, tags, sortBy = 'createdAt', sortOrder = 'desc' } = params;

    let filtered = Array.from(this.contacts.values());

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.firstName.toLowerCase().includes(searchLower) ||
          c.lastName.toLowerCase().includes(searchLower) ||
          c.email.toLowerCase().includes(searchLower) ||
          c.company?.toLowerCase().includes(searchLower)
      );
    }

    // Tags filter
    if (tags && tags.length > 0) {
      filtered = filtered.filter((c) => c.tags?.some((tag) => tags.includes(tag)));
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Pagination
    const total = filtered.length;
    const contacts = filtered.slice(skip, skip + take);

    return { contacts, total };
  }

  /**
   * Get contact by ID
   */
  getById(id: string): Contact | null {
    return this.contacts.get(id) || null;
  }

  /**
   * Create a new contact
   */
  create(input: CreateContactInput): Contact {
    const id = `contact-${this.idCounter++}`;
    const now = new Date();

    const contact: Contact = {
      id,
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    this.contacts.set(id, contact);
    return contact;
  }

  /**
   * Update an existing contact
   */
  update(id: string, input: UpdateContactInput): Contact | null {
    const existing = this.contacts.get(id);
    if (!existing) {
      return null;
    }

    const updated: Contact = {
      ...existing,
      ...input,
      updatedAt: new Date(),
    };

    this.contacts.set(id, updated);
    return updated;
  }

  /**
   * Delete a contact
   */
  delete(id: string): boolean {
    return this.contacts.delete(id);
  }

  /**
   * Get contacts count
   */
  count(): number {
    return this.contacts.size;
  }

  /**
   * Get contacts by company
   */
  getByCompany(company: string): Contact[] {
    return Array.from(this.contacts.values()).filter(
      (c) => c.company?.toLowerCase() === company.toLowerCase()
    );
  }

  /**
   * Get contacts by tag
   */
  getByTag(tag: string): Contact[] {
    return Array.from(this.contacts.values()).filter((c) => c.tags?.includes(tag));
  }
}
