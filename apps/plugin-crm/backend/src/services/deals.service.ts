/**
 * Deals Service (M2.3 Task 10)
 *
 * In-memory service for managing deals
 */

import type {
  Deal,
  DealStage,
  CreateDealInput,
  UpdateDealInput,
  ListQueryParams,
} from '../types/index.js';
import { ContactsService } from './contacts.service.js';

export class DealsService {
  private deals: Map<string, Deal> = new Map();
  private idCounter = 1;

  constructor(private contactsService: ContactsService) {
    // Add some sample data
    this.seedData();
  }

  /**
   * Seed with sample deals
   */
  private seedData() {
    const sampleDeals: CreateDealInput[] = [
      {
        title: 'Enterprise License - Acme Corp',
        description: 'Annual enterprise subscription for 500 users',
        value: 120000,
        currency: 'USD',
        stage: 'negotiation',
        probability: 75,
        expectedCloseDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // +15 days
        contactId: 'contact-1',
        tags: ['enterprise', 'high-value'],
        notes: 'CEO very interested, waiting for board approval',
      },
      {
        title: 'Tech Implementation - TechCo',
        description: 'Custom integration and onboarding services',
        value: 45000,
        currency: 'USD',
        stage: 'proposal',
        probability: 60,
        expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
        contactId: 'contact-2',
        tags: ['services', 'technical'],
        notes: 'Proposal submitted, awaiting technical review',
      },
      {
        title: 'Startup Package - Startup.io',
        description: 'Starter plan with premium support',
        value: 12000,
        currency: 'USD',
        stage: 'qualified',
        probability: 80,
        expectedCloseDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
        contactId: 'contact-3',
        tags: ['startup', 'quick-win'],
        notes: 'Very responsive, ready to move forward',
      },
      {
        title: 'Global Expansion Deal',
        description: 'Multi-region deployment for global team',
        value: 250000,
        currency: 'USD',
        stage: 'lead',
        probability: 30,
        expectedCloseDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // +90 days
        contactId: 'contact-4',
        tags: ['enterprise', 'international', 'strategic'],
        notes: 'Initial discussions, long sales cycle expected',
      },
    ];

    for (const input of sampleDeals) {
      this.create(input);
    }
  }

  /**
   * List all deals with optional filtering
   */
  list(params: ListQueryParams = {}): { deals: Deal[]; total: number } {
    const { skip = 0, take = 50, search, tags, sortBy = 'createdAt', sortOrder = 'desc' } = params;

    let filtered = Array.from(this.deals.values());

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.title.toLowerCase().includes(searchLower) ||
          d.description?.toLowerCase().includes(searchLower)
      );
    }

    // Tags filter
    if (tags && tags.length > 0) {
      filtered = filtered.filter((d) => d.tags?.some((tag) => tags.includes(tag)));
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Populate contact data
    const dealsWithContacts = filtered.map((deal) => {
      if (deal.contactId) {
        const contact = this.contactsService.getById(deal.contactId);
        return { ...deal, contact: contact || undefined };
      }
      return deal;
    });

    // Pagination
    const total = dealsWithContacts.length;
    const deals = dealsWithContacts.slice(skip, skip + take);

    return { deals, total };
  }

  /**
   * Get deal by ID
   */
  getById(id: string): Deal | null {
    const deal = this.deals.get(id);
    if (!deal) return null;

    // Populate contact data
    if (deal.contactId) {
      const contact = this.contactsService.getById(deal.contactId);
      return { ...deal, contact: contact || undefined };
    }

    return deal;
  }

  /**
   * Create a new deal
   */
  create(input: CreateDealInput): Deal {
    const id = `deal-${this.idCounter++}`;
    const now = new Date();

    const deal: Deal = {
      id,
      title: input.title,
      description: input.description,
      value: input.value,
      currency: input.currency || 'USD',
      stage: input.stage,
      probability: input.probability ?? 50,
      expectedCloseDate: input.expectedCloseDate,
      contactId: input.contactId,
      tags: input.tags,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };

    this.deals.set(id, deal);
    return deal;
  }

  /**
   * Update an existing deal
   */
  update(id: string, input: UpdateDealInput): Deal | null {
    const existing = this.deals.get(id);
    if (!existing) {
      return null;
    }

    const updated: Deal = {
      ...existing,
      ...input,
      updatedAt: new Date(),
    };

    this.deals.set(id, updated);

    // Populate contact data
    if (updated.contactId) {
      const contact = this.contactsService.getById(updated.contactId);
      return { ...updated, contact: contact || undefined };
    }

    return updated;
  }

  /**
   * Delete a deal
   */
  delete(id: string): boolean {
    return this.deals.delete(id);
  }

  /**
   * Get deals count
   */
  count(): number {
    return this.deals.size;
  }

  /**
   * Get deals by stage
   */
  getByStage(stage: DealStage): Deal[] {
    return Array.from(this.deals.values()).filter((d) => d.stage === stage);
  }

  /**
   * Get deals by contact
   */
  getByContact(contactId: string): Deal[] {
    return Array.from(this.deals.values()).filter((d) => d.contactId === contactId);
  }

  /**
   * Get pipeline summary
   */
  getPipelineSummary(): {
    totalDeals: number;
    totalValue: number;
    avgProbability: number;
    byStage: Record<DealStage, { count: number; value: number }>;
  } {
    const deals = Array.from(this.deals.values());
    const totalDeals = deals.length;
    const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
    const avgProbability = deals.reduce((sum, d) => sum + d.probability, 0) / (totalDeals || 1);

    const byStage: Record<DealStage, { count: number; value: number }> = {
      lead: { count: 0, value: 0 },
      qualified: { count: 0, value: 0 },
      proposal: { count: 0, value: 0 },
      negotiation: { count: 0, value: 0 },
      won: { count: 0, value: 0 },
      lost: { count: 0, value: 0 },
    };

    for (const deal of deals) {
      byStage[deal.stage].count++;
      byStage[deal.stage].value += deal.value;
    }

    return {
      totalDeals,
      totalValue,
      avgProbability,
      byStage,
    };
  }
}
