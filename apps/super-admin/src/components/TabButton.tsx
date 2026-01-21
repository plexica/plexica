import { Button } from '@plexica/ui';

interface TabButtonProps {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}

export function TabButton({ label, icon, active, onClick }: TabButtonProps) {
  return (
    <Button
      onClick={onClick}
      variant={active ? 'default' : 'ghost'}
      className={`flex items-center gap-2 px-4 py-3 border-b-2 rounded-none transition-colors ${
        active
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <span>{icon}</span>
      <span className="text-sm">{label}</span>
    </Button>
  );
}
