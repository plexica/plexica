/**
 * CRM API Client (M2.3 Task 10)
 *
 * Client for calling CRM plugin APIs
 * This demonstrates plugin-to-plugin communication!
 */

import axios, { type AxiosInstance } from 'axios';

/**
 * CRM Contact interface (matches CRM plugin types)
 */
export interface CRMContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  position?: string;
  tags?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * CRM Deal interface (matches CRM plugin types)
 */
export interface CRMDeal {
  id: string;
  title: string;
  description?: string;
  value: number;
  currency: string;
  stage: 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
  probability: number;
  expectedCloseDate?: string;
  contactId?: string;
  contact?: CRMContact;
  tags?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * CRM Pipeline Summary
 */
export interface CRMPipelineSummary {
  totalDeals: number;
  totalValue: number;
  avgProbability: number;
  byStage: Record<string, { count: number; value: number }>;
}

/**
 * CRM API Client
 *
 * This client calls the CRM plugin's REST APIs to fetch data
 * for analytics and reporting purposes.
 */
export class CRMApiClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3100') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`[CRM API Client] Initialized with base URL: ${baseUrl}`);
  }

  /**
   * Check if CRM service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'ok';
    } catch (error) {
      console.error('[CRM API Client] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get all contacts
   */
  async getContacts(params?: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<CRMContact[]> {
    try {
      console.log('[CRM API Client] Fetching contacts...', params);
      const response = await this.client.get('/contacts', { params });
      console.log(`[CRM API Client] ✓ Retrieved ${response.data.data.length} contacts`);
      return response.data.data;
    } catch (error) {
      console.error('[CRM API Client] Failed to fetch contacts:', error);
      throw new Error('Failed to fetch contacts from CRM plugin');
    }
  }

  /**
   * Get contact by ID
   */
  async getContactById(id: string): Promise<CRMContact | null> {
    try {
      const response = await this.client.get(`/contacts/${id}`);
      return response.data.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch contact ${id} from CRM plugin`);
    }
  }

  /**
   * Get all deals
   */
  async getDeals(params?: { skip?: number; take?: number; search?: string }): Promise<CRMDeal[]> {
    try {
      console.log('[CRM API Client] Fetching deals...', params);
      const response = await this.client.get('/deals', { params });
      console.log(`[CRM API Client] ✓ Retrieved ${response.data.data.length} deals`);
      return response.data.data;
    } catch (error) {
      console.error('[CRM API Client] Failed to fetch deals:', error);
      throw new Error('Failed to fetch deals from CRM plugin');
    }
  }

  /**
   * Get deal by ID
   */
  async getDealById(id: string): Promise<CRMDeal | null> {
    try {
      const response = await this.client.get(`/deals/${id}`);
      return response.data.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch deal ${id} from CRM plugin`);
    }
  }

  /**
   * Get pipeline summary
   */
  async getPipelineSummary(): Promise<CRMPipelineSummary> {
    try {
      console.log('[CRM API Client] Fetching pipeline summary...');
      const response = await this.client.get('/deals/pipeline/summary');
      console.log('[CRM API Client] ✓ Retrieved pipeline summary');
      return response.data.data;
    } catch (error) {
      console.error('[CRM API Client] Failed to fetch pipeline summary:', error);
      throw new Error('Failed to fetch pipeline summary from CRM plugin');
    }
  }

  /**
   * Get deals by stage
   */
  async getDealsByStage(stage: string): Promise<CRMDeal[]> {
    try {
      const response = await this.client.get(`/deals/stage/${stage}`);
      return response.data.data;
    } catch (error) {
      console.error(`[CRM API Client] Failed to fetch deals for stage ${stage}:`, error);
      throw new Error(`Failed to fetch deals for stage ${stage} from CRM plugin`);
    }
  }

  /**
   * Get deals by contact
   */
  async getDealsByContact(contactId: string): Promise<CRMDeal[]> {
    try {
      const response = await this.client.get(`/deals/contact/${contactId}`);
      return response.data.data;
    } catch (error) {
      console.error(`[CRM API Client] Failed to fetch deals for contact ${contactId}:`, error);
      throw new Error(`Failed to fetch deals for contact ${contactId} from CRM plugin`);
    }
  }
}
