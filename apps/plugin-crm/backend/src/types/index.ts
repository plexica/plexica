/**
 * CRM Plugin Types (M2.3 Task 10)
 *
 * Type definitions for contacts and deals
 */

/**
 * Contact entity
 */
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  position?: string;
  tags?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Contact creation input
 */
export interface CreateContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  position?: string;
  tags?: string[];
  notes?: string;
}

/**
 * Contact update input
 */
export interface UpdateContactInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  position?: string;
  tags?: string[];
  notes?: string;
}

/**
 * Deal stage
 */
export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

/**
 * Deal entity
 */
export interface Deal {
  id: string;
  title: string;
  description?: string;
  value: number;
  currency: string;
  stage: DealStage;
  probability: number; // 0-100
  expectedCloseDate?: Date;
  contactId?: string;
  contact?: Contact;
  tags?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Deal creation input
 */
export interface CreateDealInput {
  title: string;
  description?: string;
  value: number;
  currency?: string;
  stage: DealStage;
  probability?: number;
  expectedCloseDate?: Date;
  contactId?: string;
  tags?: string[];
  notes?: string;
}

/**
 * Deal update input
 */
export interface UpdateDealInput {
  title?: string;
  description?: string;
  value?: number;
  currency?: string;
  stage?: DealStage;
  probability?: number;
  expectedCloseDate?: Date;
  contactId?: string;
  tags?: string[];
  notes?: string;
}

/**
 * List query parameters
 */
export interface ListQueryParams {
  skip?: number;
  take?: number;
  search?: string;
  tags?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
