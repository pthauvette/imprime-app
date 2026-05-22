'use client';

/**
 * Bouton "Réinitialiser la bannière cookies" — affiché sur /settings/privacy.
 *
 * Round 26 #1. Clear le cookie plio_consent + router.refresh() pour que le
 * banner réapparaisse au prochain mount du layout root. Le session, le cart,
 * et les autres cookies non-tracking restent intacts — voir
 * lib/legal/cookie-consent.ts pour le rationale.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildResetConsentCookie } from '@/lib/legal/cookie-consent';

export default function CookieConsentResetButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setBusy(true);
    document.cookie = buildResetConsentCookie();
    setDone(true);
    setBusy(false);
    // Refresh re-run le layout root server-side. Le useEffect du
    // CookieConsent va re-probe le cookie absent → réafficher banner.
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={reset}
      disabled={busy}
      className="btn btn-secondary btn-sm"
      aria-live="polite"
    >
      {done ? '✓ Réinitialisé — la bannière reviendra' : '↻ Réinitialiser la bannière cookies'}
    </button>
  );
}
