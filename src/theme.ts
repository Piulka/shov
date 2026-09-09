import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
function savedTheme(): Theme {
  try { const value = localStorage.getItem('shov-theme'); return value === 'dark' || value === 'light' ? value : 'system'; } catch { return 'system'; }
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && (window.Telegram?.WebApp?.colorScheme ? window.Telegram.WebApp.colorScheme === 'dark' : media.matches));
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    try { localStorage.setItem('shov-theme', theme); } catch { /* Theme still works when storage is disabled. */ }
    apply(); media.addEventListener('change', apply); window.Telegram?.WebApp?.onEvent?.('themeChanged', apply);
    return () => { media.removeEventListener('change', apply); window.Telegram?.WebApp?.offEvent?.('themeChanged', apply); };
  }, [theme]);
  return { theme, setTheme };
}
