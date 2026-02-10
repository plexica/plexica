// File: apps/plugin-crm/src/components/DealsPage.tsx

import React, { useState } from 'react';
import type { PluginProps } from '@plexica/types';
import { Badge, Button, Card, CardContent, Progress, Separator, StatCard } from '@plexica/ui';
import { Calendar, DollarSign, Handshake, Plus, Trophy, User } from 'lucide-react';

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

  const STAGE_VARIANT: Record<string, 'secondary' | 'warning' | 'default' | 'success' | 'outline'> =
    {
      Lead: 'secondary',
      Qualified: 'warning',
      Proposal: 'default',
      Negotiation: 'default',
      'Closed Won': 'success',
    };

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground">Track and manage your deals</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Deal
        </Button>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Deals"
          value={deals.length}
          icon={<Handshake className="h-5 w-5" />}
        />
        <StatCard
          label="Pipeline Value"
          value={`$${totalPipelineValue}K`}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard label="In Negotiation" value={getDealsByStage('Negotiation').length} />
        <StatCard
          label="Closed This Month"
          value={getDealsByStage('Closed Won').length}
          icon={<Trophy className="h-5 w-5" />}
        />
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
            <div key={stage} className="w-80 flex-shrink-0">
              {/* Stage Header */}
              <Card className="rounded-b-none">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <h3 className="font-semibold text-foreground">{stage}</h3>
                    <p className="text-sm text-muted-foreground">${stageValue}K</p>
                  </div>
                  <Badge variant={STAGE_VARIANT[stage] ?? 'outline'}>{stageDeals.length}</Badge>
                </CardContent>
              </Card>

              {/* Stage Deals */}
              <div className="min-h-[400px] space-y-2 rounded-b-lg border border-t-0 border-border bg-muted/30 p-2">
                {stageDeals.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No deals</div>
                ) : (
                  stageDeals.map((deal) => (
                    <Card
                      key={deal.id}
                      className="cursor-pointer transition-shadow hover:shadow-md"
                    >
                      <CardContent className="p-4">
                        <h4 className="mb-2 font-medium text-foreground">{deal.name}</h4>
                        <p className="mb-3 text-lg font-bold text-primary">{deal.value}</p>

                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            {deal.contact}
                          </p>
                          <p className="flex items-center gap-1.5">
                            <Handshake className="h-3.5 w-3.5" />
                            {deal.company}
                          </p>
                          <p className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(deal.closeDate).toLocaleDateString()}
                          </p>
                        </div>

                        {/* Probability */}
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Probability</span>
                            <span className="text-xs font-medium text-foreground">
                              {deal.probability}%
                            </span>
                          </div>
                          <Progress value={deal.probability} className="h-2" />
                        </div>

                        <Separator className="my-3" />

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            View
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            Edit
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">Tenant: {tenantId}</Badge>
            <Badge variant="outline">
              {deals.length} deals across {stages.length} stages
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DealsPage;
