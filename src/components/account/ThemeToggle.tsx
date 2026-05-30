'use client';

/**
 * ThemeToggle — switch light/dark. Pose cookie plio_theme + applique
 * data-theme sur <html> immédiatement (pas besoin de reload comme la
 * LangSwitch parce que la palette est 100 % CSS variables).
 */

import { useEffect, useState } from 'react';
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from '@/lib/theme-shared';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  // Sync depuis le DOM (le SSR a déjà set data-theme sur <html> via cookie).
  useEffect(() => {
    const t = document.documentElement.dataset.theme as Theme | undefined;
    if (t === 'dark' || t === 'light') setTheme(t);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  return (
    <div
      role="group"
      aria-label="Thème"
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        background: 'var(--bg-sunken)',
        borderRadius: 'var(--r-pill)',
      }}
    >
      {(['light', 'dark'] as Theme[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => apply(t)}
          aria-pressed={theme === t}
          title={t === 'light' ? 'Clair' : 'Sombre'}
          style={{
            padding: '4px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: theme === t ? 'var(--accent-primary)' : 'transparent',
            color: theme === t ? 'var(--text-on-accent, #fff)' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 'var(--r-pill)',
            cursor: theme === t ? 'default' : 'pointer',
          }}
        >
          {t === 'light' ? '☀' : '☾'}
        </button>
      ))}
    </div>
  );
}
