/**
 * Analytics Plugin Types (M2.3 Task 10)
 *
 * Type definitions for analytics and reports
 */

/**
 * Report types
 */
export type ReportType =
  | 'contacts_summary'
  | 'deals_pipeline'
  | 'sales_forecast'
  | 'conversion_rates'
  | 'revenue_analysis';

/**
 * Time period for reports
 */
export type TimePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';

/**
 * Report entity
 */
export interface Report {
  id: string;
  name: string;
  type: ReportType;
  description?: string;
  timePeriod: TimePeriod;
  createdAt: Date;
  updatedAt: Date;
  lastRun?: Date;
}

/**
 * Report result from CRM data analysis
 */
export interface ReportResult {
  reportId: string;
  reportName: string;
  type: ReportType;
  generatedAt: Date;
  data: any; // Report-specific data structure
  metadata: {
    dataSource: string[];
    recordsAnalyzed: number;
    timePeriod: TimePeriod;
  };
}

/**
 * Contacts summary report data
 */
export interface ContactsSummaryData {
  totalContacts: number;
  byCompany: Record<string, number>;
  byTag: Record<string, number>;
  topCompanies: Array<{ company: string; count: number }>;
  recentContacts: Array<{
    id: string;
    name: string;
    company?: string;
    createdAt: Date;
  }>;
}

/**
 * Deals pipeline report data
 */
export interface DealsPipelineData {
  totalDeals: number;
  totalValue: number;
  avgDealValue: number;
  avgProbability: number;
  byStage: Record<
    string,
    {
      count: number;
      value: number;
      avgValue: number;
      avgProbability: number;
    }
  >;
  topDeals: Array<{
    id: string;
    title: string;
    value: number;
    stage: string;
    probability: number;
  }>;
}

/**
 * Sales forecast data
 */
export interface SalesForecastData {
  expectedRevenue: number;
  weightedRevenue: number; // Adjusted by probability
  confidenceLevel: 'low' | 'medium' | 'high';
  byMonth: Record<
    string,
    {
      deals: number;
      revenue: number;
      weightedRevenue: number;
    }
  >;
}
