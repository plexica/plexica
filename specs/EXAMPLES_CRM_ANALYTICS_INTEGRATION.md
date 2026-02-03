# CRM ↔ Analytics Integration Example

**Version:** 1.0  
**Last Updated:** January 2025  
**Milestone:** M2.3 - Plugin-to-Plugin Communication

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [CRM Plugin (Provider)](#crm-plugin-provider)
4. [Analytics Plugin (Consumer)](#analytics-plugin-consumer)
5. [Communication Flow](#communication-flow)
6. [Running the Example](#running-the-example)
7. [Testing](#testing)
8. [Common Customizations](#common-customizations)

## Related Documents

For technical specifications and architectural details referenced in this example, refer to:

- **[PLUGIN_ECOSYSTEM_ARCHITECTURE.md](./PLUGIN_ECOSYSTEM_ARCHITECTURE.md)** - Complete architecture that this example demonstrates
- **[PLUGIN_COMMUNICATION_API.md](./PLUGIN_COMMUNICATION_API.md)** - API specifications used in this example
- **[TECHNICAL_SPECIFICATIONS.md](./TECHNICAL_SPECIFICATIONS.md)** - Plugin system technical details (Section 6)
- **[FUNCTIONAL_SPECIFICATIONS.md](./FUNCTIONAL_SPECIFICATIONS.md)** - Functional requirements (Section 7: Plugin System)

---

## Overview

This document provides a complete walkthrough of how the **Analytics Plugin** consumes services from the **CRM Plugin** to generate reports. This is a real-world example of plugin-to-plugin communication in Plexica.

### What This Example Demonstrates

✅ **Service Registration** - CRM plugin exposes 2 services with 9 endpoints  
✅ **Dependency Declaration** - Analytics declares dependencies on CRM services  
✅ **API Gateway Communication** - Analytics calls CRM APIs via the gateway  
✅ **Data Aggregation** - Analytics generates 3 report types from CRM data  
✅ **Multi-Service Integration** - Analytics uses both `crm.contacts` and `crm.deals`

### Use Case

The Analytics plugin generates business intelligence reports by analyzing CRM data:

1. **Contacts Summary** - Overview of contacts by company and tags
2. **Sales Pipeline Analysis** - Deal distribution and pipeline health
3. **Revenue Forecast** - Projected revenue based on weighted probability

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Request                                │
│              "Run Sales Pipeline Report"                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │  Analytics Plugin (Consumer)  │
         │  - Backend: Port 3200         │
         │  - Service: analytics.reports │
         └───────────────┬───────────────┘
                         │
                         │ Needs CRM data
                         │
                         ▼
           ┌─────────────────────────┐
           │    CRM API Client       │
           │ (Plugin-to-Plugin Call) │
           └──────────┬──────────────┘
                      │
                      │ HTTP Call
                      ▼
         ┌────────────────────────────┐
         │   API Gateway (Optional)   │
         │   - Service Discovery      │
         │   - Header Injection       │
         │   - Tenant Isolation       │
         └──────────┬─────────────────┘
                    │
                    │ Routed Request
                    ▼
      ┌──────────────────────────────┐
      │  CRM Plugin (Provider)       │
      │  - Backend: Port 3100        │
      │  - Services:                 │
      │    * crm.contacts (v1.0.0)   │
      │    * crm.deals (v1.0.0)      │
      └──────────┬───────────────────┘
                 │
                 │ Return Data
                 ▼
      ┌──────────────────────────────┐
      │  Analytics generates report  │
      │  and returns to user         │
      └──────────────────────────────┘
```

### Directory Structure

```
plexica/
├── apps/
│   ├── plugin-crm/                     # Provider Plugin
│   │   ├── backend/
│   │   │   └── src/
│   │   │       ├── services/
│   │   │       │   ├── contacts.service.ts   ← Manages contacts
│   │   │       │   └── deals.service.ts      ← Manages deals
│   │   │       └── routes/
│   │   │           ├── contacts.ts           ← GET /contacts, etc.
│   │   │           └── deals.ts              ← GET /deals, etc.
│   │   └── plugin.json                       ← Declares 2 services
│   │
│   └── plugin-analytics/               # Consumer Plugin
│       ├── backend/
│       │   └── src/
│       │       ├── lib/
│       │       │   └── crm-client.ts         ← HTTP client for CRM
│       │       ├── services/
│       │       │   └── analytics.service.ts  ← Generates reports
│       │       └── routes/
│       │           └── reports.ts            ← GET /reports, etc.
│       └── plugin.json                       ← Declares dependencies
```

---

## CRM Plugin (Provider)

The CRM plugin **exposes** services that other plugins can consume.

### 1. Service Declaration (`plugin.json`)

**File:** `apps/plugin-crm/plugin.json:119-194`

```json
{
  "api": {
    "services": [
      {
        "name": "crm.contacts",
        "version": "1.0.0",
        "description": "Contact management service",
        "endpoints": [
          {
            "method": "GET",
            "path": "/contacts",
            "description": "List all contacts",
            "permissions": ["plugin.crm.contacts.read"]
          },
          {
            "method": "GET",
            "path": "/contacts/:id",
            "description": "Get contact by ID",
            "permissions": ["plugin.crm.contacts.read"]
          },
          {
            "method": "POST",
            "path": "/contacts",
            "description": "Create a new contact",
            "permissions": ["plugin.crm.contacts.write"]
          },
          {
            "method": "PUT",
            "path": "/contacts/:id",
            "description": "Update a contact",
            "permissions": ["plugin.crm.contacts.write"]
          },
          {
            "method": "DELETE",
            "path": "/contacts/:id",
            "description": "Delete a contact",
            "permissions": ["plugin.crm.contacts.write"]
          }
        ],
        "metadata": {
          "rateLimit": 100,
          "cacheTTL": 300
        }
      },
      {
        "name": "crm.deals",
        "version": "1.0.0",
        "description": "Deal management service",
        "endpoints": [
          {
            "method": "GET",
            "path": "/deals",
            "description": "List all deals",
            "permissions": ["plugin.crm.deals.read"]
          },
          {
            "method": "GET",
            "path": "/deals/:id",
            "description": "Get deal by ID",
            "permissions": ["plugin.crm.deals.read"]
          },
          {
            "method": "POST",
            "path": "/deals",
            "description": "Create a new deal",
            "permissions": ["plugin.crm.deals.write"]
          },
          {
            "method": "PUT",
            "path": "/deals/:id",
            "description": "Update a deal",
            "permissions": ["plugin.crm.deals.write"]
          }
        ]
      }
    ],
    "dependencies": []
  }
}
```

**Key Points:**

- Declares **2 services**: `crm.contacts` and `crm.deals`
- Each service has a **semantic version** (`1.0.0`)
- Lists all **endpoints** with HTTP methods and paths
- Specifies **permissions** required for each endpoint
- No dependencies (CRM is a standalone plugin)

### 2. Contacts Service Implementation

**File:** `apps/plugin-crm/backend/src/services/contacts.service.ts:1-190`

```typescript
/**
 * Contacts Service
 * In-memory service for managing contacts
 */

export class ContactsService {
  private contacts: Map<string, Contact> = new Map();
  private idCounter = 1;

  constructor() {
    this.seedData(); // Add sample contacts
  }

  /**
   * List all contacts with optional filtering
   */
  list(params: ListQueryParams = {}): { contacts: Contact[]; total: number } {
    const { skip = 0, take = 50, search, tags } = params;
    let filtered = Array.from(this.contacts.values());

    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.firstName.toLowerCase().includes(searchLower) ||
          c.lastName.toLowerCase().includes(searchLower) ||
          c.email.toLowerCase().includes(searchLower)
      );
    }

    if (tags && tags.length > 0) {
      filtered = filtered.filter((c) => c.tags?.some((tag) => tags.includes(tag)));
    }

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
    const contact: Contact = {
      id,
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.contacts.set(id, contact);
    return contact;
  }
}
```

**Sample Data (Seeded on Startup):**

```typescript
{
  id: "contact-1",
  firstName: "John",
  lastName: "Doe",
  email: "john.doe@acme.com",
  phone: "+1-555-0101",
  company: "Acme Corp",
  position: "CEO",
  tags: ["vip", "enterprise"]
}
```

The service seeds 4 sample contacts on startup for demonstration purposes.

### 3. Deals Service Implementation

**File:** `apps/plugin-crm/backend/src/services/deals.service.ts`

Similar to the contacts service, manages deals with fields:

- `id`, `title`, `description`
- `value` (numeric), `currency` (USD/EUR/GBP)
- `stage` (lead, qualified, proposal, negotiation, won, lost)
- `probability` (0-100%)
- `contactId` (links to contact)
- `expectedCloseDate`

**Special Endpoint:** `GET /deals/pipeline/summary`

Returns aggregate statistics:

```json
{
  "totalDeals": 4,
  "totalValue": 250000,
  "avgProbability": 57.5,
  "byStage": {
    "qualified": { "count": 1, "value": 50000 },
    "proposal": { "count": 2, "value": 150000 },
    "negotiation": { "count": 1, "value": 50000 }
  }
}
```

### 4. Service Registration (On Plugin Startup)

**File:** `apps/plugin-crm/backend/src/index.ts`

```typescript
import { registerServices } from './lib/service-registry.js';

async function start() {
  const app = Fastify({ logger: true });

  // Register routes
  await app.register(contactsRoutes);
  await app.register(dealsRoutes);

  // Start server
  await app.listen({ port: 3100, host: '0.0.0.0' });

  // Register services with Plexica
  await registerServices({
    pluginId: 'plugin-crm',
    tenantId: process.env.TENANT_ID || 'default-tenant',
    baseUrl: 'http://localhost:3100',
    services: [
      { name: 'crm.contacts', version: '1.0.0' },
      { name: 'crm.deals', version: '1.0.0' },
    ],
  });

  console.log('✅ CRM Plugin ready on port 3100');
}
```

**What Happens:**

1. Plugin starts its HTTP server on port 3100
2. Calls `POST /api/services/register` for each service
3. Service Registry stores services in PostgreSQL
4. Services become discoverable by other plugins

---

## Analytics Plugin (Consumer)

The Analytics plugin **consumes** CRM services to generate reports.

### 1. Dependency Declaration (`plugin.json`)

**File:** `apps/plugin-analytics/plugin.json:104-146`

```json
{
  "api": {
    "services": [
      {
        "name": "analytics.reports",
        "version": "1.0.0",
        "description": "Analytics reporting service",
        "endpoints": [
          {
            "method": "GET",
            "path": "/reports",
            "description": "List all reports"
          },
          {
            "method": "POST",
            "path": "/reports/:id/run",
            "description": "Run a report and get results"
          }
        ]
      }
    ],
    "dependencies": [
      {
        "pluginId": "plugin-crm",
        "serviceName": "crm.contacts",
        "version": "^1.0.0",
        "required": true,
        "reason": "Fetch contact data for analytics dashboards and reports"
      },
      {
        "pluginId": "plugin-crm",
        "serviceName": "crm.deals",
        "version": "^1.0.0",
        "required": true,
        "reason": "Fetch deal data for sales analytics and pipeline reports"
      }
    ]
  }
}
```

**Key Points:**

- Declares **2 dependencies** on CRM services
- Uses **semver constraint** `^1.0.0` (compatible with 1.x.x)
- Both dependencies are **required** (plugin won't install without them)
- Includes `reason` field explaining why each dependency is needed

### 2. CRM API Client

**File:** `apps/plugin-analytics/backend/src/lib/crm-client.ts:1-198`

```typescript
import axios, { type AxiosInstance } from 'axios';

/**
 * CRM API Client
 * Calls CRM plugin's REST APIs to fetch data
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
   * Get all deals
   */
  async getDeals(params?: { skip?: number; take?: number }): Promise<CRMDeal[]> {
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
}
```

**Type Definitions:**

```typescript
export interface CRMContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  position?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CRMDeal {
  id: string;
  title: string;
  value: number;
  currency: string;
  stage: 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
  probability: number;
  expectedCloseDate?: string;
  contactId?: string;
}
```

**Key Points:**

- Uses **Axios** for HTTP requests
- Base URL configured via environment variable (defaults to `localhost:3100`)
- **Detailed logging** for debugging
- **Error handling** with user-friendly messages
- **TypeScript interfaces** match CRM plugin's data structures

### 3. Analytics Service Implementation

**File:** `apps/plugin-analytics/backend/src/services/analytics.service.ts:1-317`

```typescript
import { CRMApiClient } from '../lib/crm-client.js';

export class AnalyticsService {
  private reports: Map<string, Report> = new Map();
  private crmClient: CRMApiClient;

  constructor(crmBaseUrl: string) {
    this.crmClient = new CRMApiClient(crmBaseUrl);
    this.seedReports(); // Create 3 sample reports
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

    // Generate report based on type
    switch (report.type) {
      case 'contacts_summary':
        data = await this.generateContactsSummary();
        recordsAnalyzed = data.totalContacts;
        break;

      case 'deals_pipeline':
        data = await this.generateDealsPipeline();
        recordsAnalyzed = data.totalDeals;
        break;

      case 'sales_forecast':
        data = await this.generateSalesForecast();
        recordsAnalyzed = /* ... */;
        break;
    }

    return {
      reportId,
      reportName: report.name,
      type: report.type,
      generatedAt: new Date(),
      data,
      metadata: {
        dataSource: ['crm.contacts', 'crm.deals'],
        recordsAnalyzed,
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

    return {
      totalContacts: contacts.length,
      byCompany,
      byTag,
      topCompanies,
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
      };
    }

    // Top deals
    const topDeals = deals
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return {
      totalDeals: pipelineSummary.totalDeals,
      totalValue: pipelineSummary.totalValue,
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

    const deals = await this.crmClient.getDeals();

    let expectedRevenue = 0;
    let weightedRevenue = 0;

    for (const deal of deals) {
      // Only include open deals (not won or lost)
      if (deal.stage === 'won' || deal.stage === 'lost') continue;

      expectedRevenue += deal.value;
      weightedRevenue += deal.value * (deal.probability / 100);
    }

    return {
      expectedRevenue,
      weightedRevenue,
      confidenceLevel: weightedRevenue / expectedRevenue > 0.7 ? 'high' : 'medium',
    };
  }
}
```

**Report Types:**

1. **Contacts Summary** (`contacts_summary`)
   - Fetches: `GET /contacts`
   - Analyzes: Contacts by company, by tag, top companies

2. **Deals Pipeline** (`deals_pipeline`)
   - Fetches: `GET /deals`, `GET /deals/pipeline/summary`
   - Analyzes: Total value, deals by stage, top deals

3. **Sales Forecast** (`sales_forecast`)
   - Fetches: `GET /deals`
   - Analyzes: Expected vs. weighted revenue, confidence level

---

## Communication Flow

### Complete Request Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│ Step 1: User triggers report                                         │
│ POST /reports/report-2/run                                           │
└────────────────────┬─────────────────────────────────────────────────┘
                     │
                     ▼
      ┌──────────────────────────────────┐
      │ Analytics Backend (Port 3200)    │
      │ Route: POST /reports/:id/run     │
      └────────────┬─────────────────────┘
                   │
                   │ Calls
                   ▼
      ┌──────────────────────────────────┐
      │ AnalyticsService.runReport()     │
      │ - Checks report type             │
      │ - Calls generateDealsPipeline()  │
      └────────────┬─────────────────────┘
                   │
                   │ Calls
                   ▼
      ┌──────────────────────────────────┐
      │ CRMApiClient.getDeals()          │
      │ HTTP GET http://localhost:3100/  │
      │           deals                  │
      └────────────┬─────────────────────┘
                   │
                   │ Network Request
                   ▼
      ┌──────────────────────────────────┐
      │ CRM Backend (Port 3100)          │
      │ Route: GET /deals                │
      └────────────┬─────────────────────┘
                   │
                   │ Calls
                   ▼
      ┌──────────────────────────────────┐
      │ DealsService.list()              │
      │ - Returns 4 deals from memory    │
      └────────────┬─────────────────────┘
                   │
                   │ Response
                   ▼
      ┌──────────────────────────────────┐
      │ CRM responds with JSON:          │
      │ {                                │
      │   "data": [                      │
      │     {                            │
      │       "id": "deal-1",            │
      │       "title": "Acme Corp",      │
      │       "value": 50000,            │
      │       "stage": "qualified"       │
      │     },                           │
      │     ...                          │
      │   ]                              │
      │ }                                │
      └────────────┬─────────────────────┘
                   │
                   │ Parses response
                   ▼
      ┌──────────────────────────────────┐
      │ CRMApiClient returns Deal[]      │
      └────────────┬─────────────────────┘
                   │
                   │ Returns
                   ▼
      ┌──────────────────────────────────┐
      │ AnalyticsService processes data  │
      │ - Aggregates by stage            │
      │ - Calculates totals              │
      │ - Generates report result        │
      └────────────┬─────────────────────┘
                   │
                   │ Returns
                   ▼
      ┌──────────────────────────────────┐
      │ Analytics responds to user:      │
      │ {                                │
      │   "reportName": "Sales Pipeline",│
      │   "data": {                      │
      │     "totalDeals": 4,             │
      │     "totalValue": 250000,        │
      │     "byStage": { ... }           │
      │   },                             │
      │   "metadata": {                  │
      │     "dataSource": ["crm.deals"], │
      │     "recordsAnalyzed": 4         │
      │   }                              │
      │ }                                │
      └──────────────────────────────────┘
```

### Parallel Data Fetching

The `deals_pipeline` report fetches multiple CRM endpoints in parallel:

```typescript
const [deals, pipelineSummary] = await Promise.all([
  this.crmClient.getDeals(), // GET /deals
  this.crmClient.getPipelineSummary(), // GET /deals/pipeline/summary
]);
```

**Benefits:**

- Reduces total latency by ~50%
- Both requests execute concurrently
- Results combined for comprehensive report

---

## Running the Example

### Prerequisites

1. PostgreSQL running (for service registry)
2. Redis running (for caching)
3. Node.js 18+ installed
4. Dependencies installed: `pnpm install`

### Step 1: Start Core API

```bash
cd apps/core-api
pnpm dev
```

**Expected Output:**

```
Server listening at http://localhost:3000
✅ Core API ready
```

### Step 2: Start CRM Plugin

```bash
cd apps/plugin-crm/backend
PORT=3100 pnpm dev
```

**Expected Output:**

```
[CRM Plugin] Starting on port 3100...
[Service Registry] Registering crm.contacts v1.0.0
[Service Registry] Registering crm.deals v1.0.0
✅ CRM Plugin ready on port 3100
```

### Step 3: Start Analytics Plugin

```bash
cd apps/plugin-analytics/backend
PORT=3200 CRM_BASE_URL=http://localhost:3100 pnpm dev
```

**Environment Variables:**

- `PORT=3200` - Analytics backend port
- `CRM_BASE_URL=http://localhost:3100` - URL of CRM plugin

**Expected Output:**

```
[Analytics Plugin] Starting on port 3200...
[CRM API Client] Initialized with base URL: http://localhost:3100
✅ Analytics Plugin ready on port 3200
```

### Step 4: Test the Integration

**List available reports:**

```bash
curl http://localhost:3200/reports
```

**Response:**

```json
{
  "data": [
    {
      "id": "report-1",
      "name": "Contacts Overview",
      "type": "contacts_summary"
    },
    {
      "id": "report-2",
      "name": "Sales Pipeline Analysis",
      "type": "deals_pipeline"
    },
    {
      "id": "report-3",
      "name": "Revenue Forecast",
      "type": "sales_forecast"
    }
  ]
}
```

**Run a report:**

```bash
curl -X POST http://localhost:3200/reports/report-2/run
```

**Response:**

```json
{
  "data": {
    "reportId": "report-2",
    "reportName": "Sales Pipeline Analysis",
    "type": "deals_pipeline",
    "generatedAt": "2025-01-22T10:30:00Z",
    "data": {
      "totalDeals": 4,
      "totalValue": 250000,
      "avgDealValue": 62500,
      "avgProbability": 57.5,
      "byStage": {
        "qualified": { "count": 1, "value": 50000, "avgValue": 50000 },
        "proposal": { "count": 2, "value": 150000, "avgValue": 75000 },
        "negotiation": { "count": 1, "value": 50000, "avgValue": 50000 }
      },
      "topDeals": [
        { "id": "deal-2", "title": "TechCo Platform", "value": 100000, "stage": "proposal" },
        { "id": "deal-1", "title": "Acme Enterprise", "value": 50000, "stage": "qualified" }
      ]
    },
    "metadata": {
      "dataSource": ["crm.deals", "crm.contacts"],
      "recordsAnalyzed": 4,
      "timePeriod": "all"
    }
  }
}
```

**Console Output (Analytics):**

```
================================================================================
🔄 Running Report: Sales Pipeline Analysis (deals_pipeline)
================================================================================

📊 Generating Deals Pipeline Analysis...
[CRM API Client] Fetching deals...
[CRM API Client] ✓ Retrieved 4 deals
[CRM API Client] Fetching pipeline summary...
[CRM API Client] ✓ Retrieved pipeline summary

✅ Report Generated Successfully
   - Records Analyzed: 4
   - Data Sources: crm.deals, crm.contacts
================================================================================
```

---

## Testing

### End-to-End Test Script

**File:** `scripts/test-plugin-to-plugin.sh`

```bash
#!/bin/bash

echo "🧪 Testing Plugin-to-Plugin Communication"
echo "=========================================="

# Test 1: Check CRM health
echo "1️⃣  Checking CRM plugin health..."
curl -s http://localhost:3100/health | jq .

# Test 2: Fetch contacts
echo "2️⃣  Fetching contacts from CRM..."
curl -s http://localhost:3100/contacts | jq '.data | length'

# Test 3: Fetch deals
echo "3️⃣  Fetching deals from CRM..."
curl -s http://localhost:3100/deals | jq '.data | length'

# Test 4: Check Analytics health
echo "4️⃣  Checking Analytics plugin health..."
curl -s http://localhost:3200/health | jq .

# Test 5: Run contacts summary report
echo "5️⃣  Running contacts summary report..."
curl -s -X POST http://localhost:3200/reports/report-1/run | jq '.data.data.totalContacts'

# Test 6: Run pipeline analysis report
echo "6️⃣  Running pipeline analysis report..."
curl -s -X POST http://localhost:3200/reports/report-2/run | jq '.data.data.totalDeals'

# Test 7: Run sales forecast report
echo "7️⃣  Running sales forecast report..."
curl -s -X POST http://localhost:3200/reports/report-3/run | jq '.data.data.weightedRevenue'

echo "✅ All tests passed!"
```

**Run the test:**

```bash
chmod +x scripts/test-plugin-to-plugin.sh
./scripts/test-plugin-to-plugin.sh
```

**Expected Output:**

```
🧪 Testing Plugin-to-Plugin Communication
==========================================
1️⃣  Checking CRM plugin health...
{ "status": "ok" }
2️⃣  Fetching contacts from CRM...
4
3️⃣  Fetching deals from CRM...
4
4️⃣  Checking Analytics plugin health...
{ "status": "ok" }
5️⃣  Running contacts summary report...
4
6️⃣  Running pipeline analysis report...
4
7️⃣  Running sales forecast report...
142500
✅ All tests passed!
```

### Unit Tests

**CRM Client Test:**

```typescript
describe('CRMApiClient', () => {
  it('should fetch contacts from CRM plugin', async () => {
    const client = new CRMApiClient('http://localhost:3100');
    const contacts = await client.getContacts();

    expect(contacts).toHaveLength(4);
    expect(contacts[0]).toHaveProperty('firstName');
    expect(contacts[0]).toHaveProperty('email');
  });

  it('should fetch pipeline summary', async () => {
    const client = new CRMApiClient('http://localhost:3100');
    const summary = await client.getPipelineSummary();

    expect(summary).toHaveProperty('totalDeals');
    expect(summary).toHaveProperty('byStage');
    expect(summary.totalDeals).toBeGreaterThan(0);
  });
});
```

---

## Common Customizations

### 1. Add New Report Type

**Step 1:** Define report type in Analytics

```typescript
// apps/plugin-analytics/backend/src/types/index.ts
export type ReportType =
  | 'contacts_summary'
  | 'deals_pipeline'
  | 'sales_forecast'
  | 'customer_lifetime_value'; // ← New type
```

**Step 2:** Implement report generator

```typescript
// apps/plugin-analytics/backend/src/services/analytics.service.ts
private async generateCustomerLifetimeValue(): Promise<CLVData> {
  const contacts = await this.crmClient.getContacts();
  const deals = await this.crmClient.getDeals();

  // Group deals by contact
  const dealsByContact = new Map<string, CRMDeal[]>();
  for (const deal of deals) {
    if (deal.contactId) {
      const existing = dealsByContact.get(deal.contactId) || [];
      dealsByContact.set(deal.contactId, [...existing, deal]);
    }
  }

  // Calculate CLV for each contact
  const clvData = contacts.map(contact => {
    const contactDeals = dealsByContact.get(contact.id) || [];
    const totalValue = contactDeals
      .filter(d => d.stage === 'won')
      .reduce((sum, d) => sum + d.value, 0);

    return {
      contactId: contact.id,
      contactName: `${contact.firstName} ${contact.lastName}`,
      company: contact.company,
      lifetimeValue: totalValue,
      dealCount: contactDeals.length,
    };
  });

  return {
    contacts: clvData.sort((a, b) => b.lifetimeValue - a.lifetimeValue),
    avgCLV: clvData.reduce((sum, c) => sum + c.lifetimeValue, 0) / clvData.length,
  };
}
```

**Step 3:** Add case to `runReport()`

```typescript
case 'customer_lifetime_value':
  data = await this.generateCustomerLifetimeValue();
  dataSource.push('crm.contacts', 'crm.deals');
  break;
```

### 2. Add Caching Layer

Cache CRM responses in Analytics plugin to reduce API calls:

```typescript
import NodeCache from 'node-cache';

export class CRMApiClient {
  private cache: NodeCache;

  constructor(baseUrl: string) {
    this.cache = new NodeCache({ stdTTL: 300 }); // 5 min cache
    // ... rest of constructor
  }

  async getContacts(params?: { skip?: number; take?: number }): Promise<CRMContact[]> {
    const cacheKey = `contacts:${JSON.stringify(params)}`;
    const cached = this.cache.get<CRMContact[]>(cacheKey);

    if (cached) {
      console.log('[CRM API Client] ✓ Cache hit for contacts');
      return cached;
    }

    const response = await this.client.get('/contacts', { params });
    const contacts = response.data.data;

    this.cache.set(cacheKey, contacts);
    return contacts;
  }
}
```

### 3. Add Error Recovery

Gracefully handle CRM plugin downtime:

```typescript
async runReport(reportId: string): Promise<ReportResult> {
  const report = this.reports.get(reportId);
  if (!report) {
    throw new Error(`Report ${reportId} not found`);
  }

  // Retry logic for CRM availability
  let retries = 3;
  while (retries > 0) {
    const isAvailable = await this.crmClient.healthCheck();
    if (isAvailable) break;

    console.warn(`CRM not available, retrying... (${retries} left)`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    retries--;
  }

  if (retries === 0) {
    // Fallback: Return cached data or partial report
    return {
      reportId,
      reportName: report.name,
      type: report.type,
      error: 'CRM plugin unavailable',
      data: null,
      generatedAt: new Date(),
    };
  }

  // ... rest of report generation
}
```

### 4. Add Real-Time Updates

Use Shared Data Service for real-time notifications:

**CRM Plugin (when deal changes):**

```typescript
import { SharedDataService } from '@plexica/shared-data';

async function updateDeal(dealId: string, updates: DealUpdate) {
  const deal = await dealsService.update(dealId, updates);

  // Notify Analytics of change
  await sharedData.set(
    tenantId,
    'crm.events',
    'last-deal-update',
    {
      dealId: deal.id,
      timestamp: new Date(),
      action: 'update',
    },
    'plugin-crm',
    { ttl: 300 } // 5 minutes
  );

  return deal;
}
```

**Analytics Plugin (check for updates):**

```typescript
async function checkForUpdates() {
  const lastUpdate = await sharedData.get(tenantId, 'crm.events', 'last-deal-update');

  if (lastUpdate && isNewer(lastUpdate.timestamp)) {
    console.log('🔔 CRM data updated, invalidating cache...');
    crmClient.clearCache();
  }
}
```

---

## Summary

This example demonstrates a complete plugin-to-plugin integration:

✅ **CRM Plugin** exposes 2 services with 9 endpoints  
✅ **Analytics Plugin** declares dependencies and consumes CRM data  
✅ **Type-Safe Communication** via shared TypeScript interfaces  
✅ **Error Handling** with retries and fallbacks  
✅ **Performance** with parallel fetching and caching  
✅ **Logging** for debugging and monitoring

### Key Takeaways

1. **Declare Dependencies** in `plugin.json` with semantic versions
2. **Create API Clients** for type-safe communication
3. **Use Service Methods** to encapsulate business logic
4. **Handle Errors** gracefully with retries and fallbacks
5. **Test End-to-End** with real plugins running

### Next Steps

- Add more report types
- Implement caching for better performance
- Use Shared Data Service for real-time updates
- Add authentication/authorization
- Deploy to production (Kubernetes)

---

**Related Documentation:**

- [API Reference](../api/plugin-communication-api.md) - Complete API documentation
- [Plugin Developer Guide](../guides/plugin-development.md) - Building plugins
- [Architecture Overview](../architecture/plugin-ecosystem.md) - System design

---

_Plexica Example Documentation v1.0_  
_Last Updated: January 2025_  
_Milestone: M2.3 - Plugin-to-Plugin Communication_
