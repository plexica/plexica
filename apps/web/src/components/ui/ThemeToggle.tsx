// apps/web/src/components/ui/ThemeToggle.tsx

import { Moon, Sun } from 'lucide-react';
import { Button } from '@plexica/ui';
import { useTheme } from '../../contexts/ThemeContext';

export function ThemeToggle() {
  const { isDark, setTheme, theme } = useTheme();

  const handleToggle = () => {
    if (theme === 'system') {
      // If on system, switch to the opposite of current
      setTheme(isDark ? 'light' : 'dark');
    } else if (theme === 'light') {
      setTheme('dark');
    } else {
      setTheme('light');
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className="w-10 h-10 p-0"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
