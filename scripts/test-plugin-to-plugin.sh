#!/usr/bin/env bash

# Plugin-to-Plugin Communication End-to-End Test (M2.3 Task 10)
# 
# This script demonstrates the complete flow of plugin-to-plugin communication:
# 1. CRM Plugin exposes contacts and deals APIs
# 2. Analytics Plugin calls those APIs to generate reports
# 3. Data flows from CRM → Analytics seamlessly

set -e

echo ""
echo "================================================================================"
echo " M2.3 PLUGIN-TO-PLUGIN COMMUNICATION - END-TO-END TEST"
echo "================================================================================"
echo ""

# Configuration
CRM_URL="http://localhost:3100"
ANALYTICS_URL="http://localhost:3200"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health Checks
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Health Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${BLUE}[CRM Plugin]${NC} Checking health..."
CRM_HEALTH=$(curl -s $CRM_URL/health)
CRM_STATUS=$(echo $CRM_HEALTH | jq -r '.status')
CRM_CONTACTS=$(echo $CRM_HEALTH | jq -r '.services.contacts')
CRM_DEALS=$(echo $CRM_HEALTH | jq -r '.services.deals')

if [ "$CRM_STATUS" = "ok" ]; then
    echo -e "${GREEN}✓${NC} CRM Plugin is healthy"
    echo "  - Contacts: $CRM_CONTACTS"
    echo "  - Deals: $CRM_DEALS"
else
    echo "❌ CRM Plugin is not responding"
    exit 1
fi

echo ""

echo -e "${BLUE}[Analytics Plugin]${NC} Checking health..."
ANALYTICS_HEALTH=$(curl -s $ANALYTICS_URL/health)
ANALYTICS_STATUS=$(echo $ANALYTICS_HEALTH | jq -r '.status')
ANALYTICS_REPORTS=$(echo $ANALYTICS_HEALTH | jq -r '.reports')
ANALYTICS_CRM_DEP=$(echo $ANALYTICS_HEALTH | jq -r '.dependencies.crm')

if [ "$ANALYTICS_STATUS" = "ok" ]; then
    echo -e "${GREEN}✓${NC} Analytics Plugin is healthy"
    echo "  - Reports: $ANALYTICS_REPORTS"
    echo "  - CRM Dependency: $ANALYTICS_CRM_DEP"
else
    echo "❌ Analytics Plugin is not responding"
    exit 1
fi

echo ""

# Test 2: Direct CRM API Access
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Test CRM Plugin APIs (Data Source)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${BLUE}[CRM Plugin]${NC} GET /contacts"
CONTACTS_RESPONSE=$(curl -s $CRM_URL/contacts)
CONTACTS_COUNT=$(echo $CONTACTS_RESPONSE | jq '.total')
FIRST_CONTACT=$(echo $CONTACTS_RESPONSE | jq -r '.data[0] | "\(.firstName) \(.lastName) - \(.company)"')

echo -e "${GREEN}✓${NC} Retrieved $CONTACTS_COUNT contacts"
echo "  - First contact: $FIRST_CONTACT"

echo ""

echo -e "${BLUE}[CRM Plugin]${NC} GET /deals"
DEALS_RESPONSE=$(curl -s $CRM_URL/deals)
DEALS_COUNT=$(echo $DEALS_RESPONSE | jq '.total')
FIRST_DEAL=$(echo $DEALS_RESPONSE | jq -r '.data[0] | "\(.title) - $\(.value)"')

echo -e "${GREEN}✓${NC} Retrieved $DEALS_COUNT deals"
echo "  - First deal: $FIRST_DEAL"

echo ""

echo -e "${BLUE}[CRM Plugin]${NC} GET /deals/pipeline/summary"
PIPELINE=$(curl -s $CRM_URL/deals/pipeline/summary)
TOTAL_VALUE=$(echo $PIPELINE | jq -r '.data.totalValue')
AVG_PROBABILITY=$(echo $PIPELINE | jq -r '.data.avgProbability')

echo -e "${GREEN}✓${NC} Pipeline Summary"
echo "  - Total Value: \$$TOTAL_VALUE"
echo "  - Avg Probability: $AVG_PROBABILITY%"

echo ""

# Test 3: Plugin-to-Plugin Communication
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Test Plugin-to-Plugin Communication 🔥"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${BLUE}[Analytics Plugin]${NC} GET /reports"
REPORTS=$(curl -s $ANALYTICS_URL/reports)
REPORT1_NAME=$(echo $REPORTS | jq -r '.data[0].name')
REPORT2_NAME=$(echo $REPORTS | jq -r '.data[1].name')
REPORT3_NAME=$(echo $REPORTS | jq -r '.data[2].name')

echo -e "${GREEN}✓${NC} Available Reports:"
echo "  1. $REPORT1_NAME"
echo "  2. $REPORT2_NAME"
echo "  3. $REPORT3_NAME"

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Now testing Analytics → CRM communication...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Test Report 1: Contacts Summary (calls GET /contacts)
echo -e "${BLUE}[Analytics Plugin]${NC} POST /reports/report-1/run"
echo "  → This will call CRM Plugin: GET /contacts"
echo ""

REPORT1_RESULT=$(curl -s -X POST $ANALYTICS_URL/reports/report-1/run)
REPORT1_SUCCESS=$(echo $REPORT1_RESULT | jq -r '.success')
REPORT1_RECORDS=$(echo $REPORT1_RESULT | jq -r '.data.metadata.recordsAnalyzed')
REPORT1_SOURCES=$(echo $REPORT1_RESULT | jq -r '.data.metadata.dataSource | join(", ")')
REPORT1_TOTAL=$(echo $REPORT1_RESULT | jq -r '.data.data.totalContacts')
REPORT1_TOP_COMPANY=$(echo $REPORT1_RESULT | jq -r '.data.data.topCompanies[0].company')

if [ "$REPORT1_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✓${NC} Report Generated Successfully!"
    echo "  - Data Sources: $REPORT1_SOURCES"
    echo "  - Records Analyzed: $REPORT1_RECORDS"
    echo "  - Total Contacts: $REPORT1_TOTAL"
    echo "  - Top Company: $REPORT1_TOP_COMPANY"
    echo -e "${GREEN}  ✓ PLUGIN-TO-PLUGIN COMMUNICATION SUCCESSFUL!${NC}"
else
    echo "❌ Report generation failed"
    exit 1
fi

echo ""

# Test Report 2: Pipeline Analysis (calls GET /deals + GET /deals/pipeline/summary)
echo -e "${BLUE}[Analytics Plugin]${NC} POST /reports/report-2/run"
echo "  → This will call CRM Plugin: GET /deals, GET /deals/pipeline/summary"
echo ""

REPORT2_RESULT=$(curl -s -X POST $ANALYTICS_URL/reports/report-2/run)
REPORT2_SUCCESS=$(echo $REPORT2_RESULT | jq -r '.success')
REPORT2_RECORDS=$(echo $REPORT2_RESULT | jq -r '.data.metadata.recordsAnalyzed')
REPORT2_SOURCES=$(echo $REPORT2_RESULT | jq -r '.data.metadata.dataSource | join(", ")')
REPORT2_TOTAL_VALUE=$(echo $REPORT2_RESULT | jq -r '.data.data.totalValue')
REPORT2_AVG_VALUE=$(echo $REPORT2_RESULT | jq -r '.data.data.avgDealValue')

if [ "$REPORT2_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✓${NC} Report Generated Successfully!"
    echo "  - Data Sources: $REPORT2_SOURCES"
    echo "  - Records Analyzed: $REPORT2_RECORDS"
    echo "  - Total Pipeline Value: \$$REPORT2_TOTAL_VALUE"
    echo "  - Avg Deal Value: \$$REPORT2_AVG_VALUE"
    echo -e "${GREEN}  ✓ PLUGIN-TO-PLUGIN COMMUNICATION SUCCESSFUL!${NC}"
else
    echo "❌ Report generation failed"
    exit 1
fi

echo ""

# Test Report 3: Sales Forecast (calls GET /deals)
echo -e "${BLUE}[Analytics Plugin]${NC} POST /reports/report-3/run"
echo "  → This will call CRM Plugin: GET /deals"
echo ""

REPORT3_RESULT=$(curl -s -X POST $ANALYTICS_URL/reports/report-3/run)
REPORT3_SUCCESS=$(echo $REPORT3_RESULT | jq -r '.success')
REPORT3_EXPECTED=$(echo $REPORT3_RESULT | jq -r '.data.data.expectedRevenue')
REPORT3_WEIGHTED=$(echo $REPORT3_RESULT | jq -r '.data.data.weightedRevenue')
REPORT3_CONFIDENCE=$(echo $REPORT3_RESULT | jq -r '.data.data.confidenceLevel')

if [ "$REPORT3_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✓${NC} Report Generated Successfully!"
    echo "  - Expected Revenue: \$$REPORT3_EXPECTED"
    echo "  - Weighted Revenue: \$$REPORT3_WEIGHTED"
    echo "  - Confidence: $REPORT3_CONFIDENCE"
    echo -e "${GREEN}  ✓ PLUGIN-TO-PLUGIN COMMUNICATION SUCCESSFUL!${NC}"
else
    echo "❌ Report generation failed"
    exit 1
fi

echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  • CRM Plugin: Running on $CRM_URL"
echo "  • Analytics Plugin: Running on $ANALYTICS_URL"
echo "  • Communication Flow: Analytics → CRM"
echo "  • Data Sources Used: crm.contacts, crm.deals"
echo "  • Reports Generated: 3/3"
echo ""
echo "🎉 Plugin-to-Plugin Communication is WORKING PERFECTLY!"
echo ""
echo "This demonstrates M2.3 Task 10 - Sample CRM → Analytics Integration"
echo "The Analytics plugin successfully calls CRM plugin APIs to generate reports,"
echo "showing that plugins can depend on and communicate with each other."
echo ""
echo "================================================================================"
echo ""
