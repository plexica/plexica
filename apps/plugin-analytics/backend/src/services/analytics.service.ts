/**
 * Analytics Service (M2.3 Task 10)
 *
 * Service that generates analytics reports by calling CRM plugin APIs
 * This demonstrates plugin-to-plugin communication!
 */

import type {
  Report,
  ReportResult,
  ContactsSummaryData,
  DealsPipelineData,
  SalesForecastData,
} from '../types/index.js';
import { CRMApiClient } from '../lib/crm-client.js';

export class AnalyticsService {
  private reports: Map<string, Report> = new Map();
  private idCounter = 1;
  private crmClient: CRMApiClient;

  constructor(crmBaseUrl: string) {
    this.crmClient = new CRMApiClient(crmBaseUrl);
    this.seedReports();
  }

  /**
   * Seed with sample reports
   */
  private seedReports() {
    const sampleReports: Array<Omit<Report, 'id' | 'createdAt' | 'updatedAt'>> = [
      {
        name: 'Contacts Overview',
        type: 'contacts_summary',
        description: 'Summary of all contacts by company and tag',
        timePeriod: 'all',
      },
      {
        name: 'Sales Pipeline Analysis',
        type: 'deals_pipeline',
        description: 'Current pipeline status and deal distribution by stage',
        timePeriod: 'all',
      },
      {
        name: 'Revenue Forecast',
        type: 'sales_forecast',
        description: 'Expected revenue based on current pipeline',
        timePeriod: 'quarter',
      },
    ];

    for (const report of sampleReports) {
      const id = `report-${this.idCounter++}`;
      const now = new Date();
      this.reports.set(id, {
        id,
        ...report,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  /**
   * List all reports
   */
  list(): Report[] {
    return Array.from(this.reports.values());
  }

  /**
   * Get report by ID
   */
  getById(id: string): Report | null {
    return this.reports.get(id) || null;
  }

  /**
   * Run a report and generate results
   * This is where the plugin-to-plugin magic happens!
   */
  async runReport(reportId: string): Promise<ReportResult> {
    const report = this.reports.get(reportId);
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔄 Running Report: ${report.name} (${report.type})`);
    console.log(`${'='.repeat(80)}\n`);

    // Check CRM availability
    const isAvailable = await this.crmClient.healthCheck();
    if (!isAvailable) {
      throw new Error('CRM plugin is not available');
    }

    let data: any;
    let recordsAnalyzed = 0;
    const dataSource: string[] = [];

    // Generate report based on type
    switch (report.type) {
      case 'contacts_summary':
        data = await this.generateContactsSummary();
        dataSource.push('crm.contacts');
        recordsAnalyzed = data.totalContacts;
        break;

      case 'deals_pipeline':
        data = await this.generateDealsPipeline();
        dataSource.push('crm.deals', 'crm.contacts');
        recordsAnalyzed = data.totalDeals;
        break;

      case 'sales_forecast':
        data = await this.generateSalesForecast();
        dataSource.push('crm.deals');
        recordsAnalyzed = data.byMonth
          ? (Object.values(data.byMonth).reduce(
              (sum: number, m: any) => sum + (m?.deals || 0),
              0
            ) as number)
          : 0;
        break;

      default:
        throw new Error(`Unsupported report type: ${report.type}`);
    }

    // Update last run timestamp
    report.lastRun = new Date();
    this.reports.set(reportId, report);

    console.log(`\n✅ Report Generated Successfully`);
    console.log(`   - Records Analyzed: ${recordsAnalyzed}`);
    console.log(`   - Data Sources: ${dataSource.join(', ')}`);
    console.log(`${'='.repeat(80)}\n`);

    return {
      reportId,
      reportName: report.name,
      type: report.type,
      generatedAt: new Date(),
      data,
      metadata: {
        dataSource,
        recordsAnalyzed,
        timePeriod: report.timePeriod,
      },
    };
  }

  /**
   * Generate contacts summary report
   * Calls CRM API: GET /contacts
   */
  private async generateContactsSummary(): Promise<ContactsSummaryData> {
    console.log('📊 Generating Contacts Summary...');

    // Fetch contacts from CRM plugin
    const contacts = await this.crmClient.getContacts();

    // Analyze by company
    const byCompany: Record<string, number> = {};
    for (const contact of contacts) {
      if (contact.company) {
        byCompany[contact.company] = (byCompany[contact.company] || 0) + 1;
      }
    }

    // Analyze by tag
    const byTag: Record<string, number> = {};
    for (const contact of contacts) {
      if (contact.tags) {
        for (const tag of contact.tags) {
          byTag[tag] = (byTag[tag] || 0) + 1;
        }
      }
    }

    // Top companies
    const topCompanies = Object.entries(byCompany)
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Recent contacts
    const recentContacts = contacts
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        company: c.company,
        createdAt: new Date(c.createdAt),
      }));

    return {
      totalContacts: contacts.length,
      byCompany,
      byTag,
      topCompanies,
      recentContacts,
    };
  }

  /**
   * Generate deals pipeline report
   * Calls CRM API: GET /deals, GET /deals/pipeline/summary
   */
  private async generateDealsPipeline(): Promise<DealsPipelineData> {
    console.log('📊 Generating Deals Pipeline Analysis...');

    // Fetch deals and pipeline summary from CRM plugin
    const [deals, pipelineSummary] = await Promise.all([
      this.crmClient.getDeals(),
      this.crmClient.getPipelineSummary(),
    ]);

    // Calculate stage details
    const byStage: Record<string, any> = {};
    for (const [stage, stats] of Object.entries(pipelineSummary.byStage)) {
      byStage[stage] = {
        count: stats.count,
        value: stats.value,
        avgValue: stats.count > 0 ? stats.value / stats.count : 0,
        avgProbability: 0, // Calculate below
      };
    }

    // Calculate average probability per stage
    for (const deal of deals) {
      if (byStage[deal.stage]) {
        byStage[deal.stage].avgProbability =
          (byStage[deal.stage].avgProbability || 0) + deal.probability / byStage[deal.stage].count;
      }
    }

    // Top deals
    const topDeals = deals
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map((d) => ({
        id: d.id,
        title: d.title,
        value: d.value,
        stage: d.stage,
        probability: d.probability,
      }));

    const avgDealValue =
      deals.length > 0 ? pipelineSummary.totalValue / pipelineSummary.totalDeals : 0;

    return {
      totalDeals: pipelineSummary.totalDeals,
      totalValue: pipelineSummary.totalValue,
      avgDealValue,
      avgProbability: pipelineSummary.avgProbability,
      byStage,
      topDeals,
    };
  }

  /**
   * Generate sales forecast
   * Calls CRM API: GET /deals
   */
  private async generateSalesForecast(): Promise<SalesForecastData> {
    console.log('📊 Generating Sales Forecast...');

    // Fetch deals from CRM plugin
    const deals = await this.crmClient.getDeals();

    let expectedRevenue = 0;
    let weightedRevenue = 0;
    const byMonth: Record<string, any> = {};

    for (const deal of deals) {
      // Only include open deals (not won or lost)
      if (deal.stage === 'won' || deal.stage === 'lost') continue;

      expectedRevenue += deal.value;
      weightedRevenue += deal.value * (deal.probability / 100);

      // Group by month if there's an expected close date
      if (deal.expectedCloseDate) {
        const date = new Date(deal.expectedCloseDate);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!byMonth[monthKey]) {
          byMonth[monthKey] = { deals: 0, revenue: 0, weightedRevenue: 0 };
        }

        byMonth[monthKey].deals++;
        byMonth[monthKey].revenue += deal.value;
        byMonth[monthKey].weightedRevenue += deal.value * (deal.probability / 100);
      }
    }

    // Determine confidence level
    let confidenceLevel: 'low' | 'medium' | 'high' = 'medium';
    const avgProbability = deals.length > 0 ? weightedRevenue / expectedRevenue : 0;
    if (avgProbability < 0.4) confidenceLevel = 'low';
    else if (avgProbability > 0.7) confidenceLevel = 'high';

    return {
      expectedRevenue,
      weightedRevenue,
      confidenceLevel,
      byMonth,
    };
  }
}
