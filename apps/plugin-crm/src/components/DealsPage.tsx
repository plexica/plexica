// File: apps/plugin-crm/src/components/DealsPage.tsx

import React, { useState } from 'react';
import type { PluginProps } from '@plexica/types';

interface Deal {
  id: number;
  name: string;
  value: string;
  stage: string;
  contact: string;
  company: string;
  probability: number;
  closeDate: string;
}

/**
 * Deals Page - Kanban-style sales pipeline
 */
const DealsPage: React.FC<PluginProps> = ({ tenantId }) => {
  // Mock deals data organized by stage
  const stages = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won'];

  const [deals] = useState<Deal[]>([
    {
      id: 1,
      name: 'Acme Corp Deal',
      value: '$45K',
      stage: 'Negotiation',
      contact: 'John Smith',
      company: 'Acme Corp',
      probability: 75,
      closeDate: '2026-02-15',
    },
    {
      id: 2,
      name: 'TechStart Partnership',
      value: '$120K',
      stage: 'Proposal',
      contact: 'Sarah Johnson',
      company: 'TechStart',
      probability: 60,
      closeDate: '2026-03-01',
    },
    {
      id: 3,
      name: 'Global Industries',
      value: '$85K',
      stage: 'Qualified',
      contact: 'Mike Davis',
      company: 'Global Industries',
      probability: 45,
      closeDate: '2026-03-15',
    },
    {
      id: 4,
      name: 'Innovate Co',
      value: '$32K',
      stage: 'Lead',
      contact: 'Emily Chen',
      company: 'Innovate Co',
      probability: 20,
      closeDate: '2026-04-01',
    },
    {
      id: 5,
      name: 'MegaCorp Expansion',
      value: '$250K',
      stage: 'Negotiation',
      contact: 'Robert Taylor',
      company: 'MegaCorp',
      probability: 80,
      closeDate: '2026-02-28',
    },
    {
      id: 6,
      name: 'SmartTech Solution',
      value: '$67K',
      stage: 'Proposal',
      contact: 'Lisa Wong',
      company: 'SmartTech',
      probability: 55,
      closeDate: '2026-03-10',
    },
    {
      id: 7,
      name: 'DataPro Integration',
      value: '$95K',
      stage: 'Closed Won',
      contact: 'Tom Anderson',
      company: 'DataPro',
      probability: 100,
      closeDate: '2026-01-20',
    },
  ]);

  const getDealsByStage = (stage: string) => {
    return deals.filter((deal) => deal.stage === stage);
  };

  const totalPipelineValue = deals
    .filter((d) => d.stage !== 'Closed Won')
    .reduce((sum, deal) => sum + parseInt(deal.value.replace(/[$K,]/g, '')), 0);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Sales Pipeline</h1>
        <p className="text-gray-600 mt-1">Track and manage your deals</p>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">Total Deals</p>
          <p className="text-2xl font-bold text-gray-900">{deals.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">Pipeline Value</p>
          <p className="text-2xl font-bold text-gray-900">${totalPipelineValue}K</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">In Negotiation</p>
          <p className="text-2xl font-bold text-gray-900">
            {getDealsByStage('Negotiation').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">Closed This Month</p>
          <p className="text-2xl font-bold text-green-600">
            {getDealsByStage('Closed Won').length}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-6">
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          + Add Deal
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = getDealsByStage(stage);
          const stageValue = stageDeals.reduce(
            (sum, deal) => sum + parseInt(deal.value.replace(/[$K,]/g, '')),
            0
          );

          return (
            <div key={stage} className="flex-shrink-0 w-80">
              {/* Stage Header */}
              <div className="bg-gray-100 rounded-t-lg p-4 border-b-2 border-gray-300">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-gray-900">{stage}</h3>
                  <span className="bg-gray-200 text-gray-700 text-xs font-medium px-2 py-1 rounded-full">
                    {stageDeals.length}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">${stageValue}K</p>
              </div>

              {/* Stage Deals */}
              <div className="bg-gray-50 rounded-b-lg p-2 min-h-[400px] space-y-2">
                {stageDeals.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">No deals</div>
                ) : (
                  stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <h4 className="font-medium text-gray-900 mb-2">{deal.name}</h4>
                      <p className="text-lg font-bold text-blue-600 mb-2">{deal.value}</p>

                      <div className="space-y-1 text-sm text-gray-600">
                        <p>
                          <span className="font-medium">Contact:</span> {deal.contact}
                        </p>
                        <p>
                          <span className="font-medium">Company:</span> {deal.company}
                        </p>
                        <p>
                          <span className="font-medium">Close Date:</span>{' '}
                          {new Date(deal.closeDate).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Probability Bar */}
                      <div className="mt-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-gray-600">Probability</span>
                          <span className="text-xs font-medium text-gray-900">
                            {deal.probability}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              deal.probability >= 75
                                ? 'bg-green-500'
                                : deal.probability >= 50
                                  ? 'bg-yellow-500'
                                  : 'bg-orange-500'
                            }`}
                            style={{ width: `${deal.probability}%` }}
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                        <button className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          View
                        </button>
                        <button className="text-xs text-gray-600 hover:text-gray-800 font-medium">
                          Edit
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Info */}
      <div className="mt-8 p-4 bg-gray-100 rounded text-xs text-gray-600">
        <strong>Plugin Context:</strong> Tenant: {tenantId} | Showing {deals.length} deals across{' '}
        {stages.length} stages
      </div>
    </div>
  );
};

export default DealsPage;
