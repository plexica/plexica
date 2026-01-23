import { Card, CardContent } from '@plexica/ui';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
}

export function StatCard({ title, value, icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <span className="text-2xl">{icon}</span>
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
