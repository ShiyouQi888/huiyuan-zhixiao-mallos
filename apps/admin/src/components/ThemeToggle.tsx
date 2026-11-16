import { Button } from './ui';
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { applyThemeMode, getThemeMode } from '../theme';

export function ThemeToggle() {
  const [mode, setMode] = useState(getThemeMode);
  const nextMode = mode === 'dark' ? 'light' : 'dark';

  const toggle = () => {
    applyThemeMode(nextMode);
    setMode(nextMode);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      className="text-ink-muted hover:text-ink"
      onClick={toggle}
      aria-label={`切换为${nextMode === 'light' ? '浅色' : '深色'}主题`}
      title={`切换为${nextMode === 'light' ? '浅色' : '深色'}主题`}
    >
      {mode === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </Button>
  );
}
