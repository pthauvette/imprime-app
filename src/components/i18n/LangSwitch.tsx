'use client';

/**
 * Toggle FR ↔ EN. Pose le cookie plio_lang + reload pour que le SSR
 * re-render dans la nouvelle locale (cookies sont lus server-side).
 *
 * Style : pill bouton inline, 2 chips FR/EN. Active state = couleur accent.
 */

import { useT } from './LocaleProvider';
import { LOCALE_COOKIE_NAME, LOCALE_COOKIE_MAX_AGE } from '@/lib/i18n/locale';
import { ALL_LOCALES, I18N_SWITCH_ENABLED, type Locale } from '@/lib/i18n/messages';

export default function LangSwitch() {
  const { locale } = useT();

  // Round 8 #1 — masqué tant que la couverture i18n est insuffisante (cf.
  // I18N_SWITCH_ENABLED dans messages.ts). Un seul flag pour ré-exposer le
  // switch une fois l'extraction EN faite.
  if (!I18N_SWITCH_ENABLED) return null;

  function switchTo(next: Locale) {
    if (next === locale) return;
    // Pose le cookie côté client puis reload — le server-side render lira
    // le nouveau cookie au render suivant. Path=/ pour matcher toutes les
    // routes, SameSite=Lax pour fonctionner sur les redirects OAuth, etc.
    document.cookie = `${LOCALE_COOKIE_NAME}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        background: 'var(--bg-sunken)',
        borderRadius: 'var(--r-pill)',
      }}
    >
      {ALL_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          aria-pressed={locale === l}
          style={{
            padding: '4px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: locale === l ? 'var(--accent-primary)' : 'transparent',
            color: locale === l ? 'var(--text-on-accent, #fff)' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 'var(--r-pill)',
            cursor: locale === l ? 'default' : 'pointer',
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
