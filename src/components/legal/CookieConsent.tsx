'use client';

/**
 * Cookie consent banner — affiché sur la 1ère visite, dismissé via cookie.
 *
 * Approche minimale CASL-compliant (Canadian Anti-Spam) + GDPR-friendly :
 *   - Plio n'utilise que des cookies strictly necessary (session auth,
 *     cart, referral ref, plio_lang locale)
 *   - On informe l'utilisateur via le banner, on respecte son choix de
 *     dismiss
 *   - Pas de cookies tiers tracking (Google Analytics non installé pour
 *     MVP — quand ça arrive, on devra demander un opt-in explicite)
 *
 * Storage : cookie 'plio_consent' avec value 'ok' (1 an). Si absent →
 * affiche le banner. Si présent → silencieux.
 *
 * Pas de modal bloquant : le banner glisse en bas + ne bloque pas le
 * scroll/interaction. UX moderne vs les murs de "Accept All" intrusifs.
 */

import { useEffect, useState } from 'react';
import { buildConsentCookie, hasConsentCookie } from '@/lib/legal/cookie-consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Round 26 #1 — extraits dans @/lib/legal/cookie-consent pour test +
    // server-side reuse. Pas de re-render si déjà ack-é.
    if (!hasConsentCookie(document.cookie)) {
      // Small delay pour pas spammer au 1er paint (laisse la page render)
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  function accept() {
    document.cookie = buildConsentCookie();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Avis sur les cookies"
      style={{
        position: 'fixed',
        // Audit mobile (thème safe-area) — respecter le home indicator iOS
        // (viewportFit:cover déclaré) : la bannière ne colle plus au bord bas.
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        left: 16,
        right: 16,
        maxWidth: 720,
        margin: '0 auto',
        // Round 43 #1 — bandeau inversé : fond + texte basculent ENSEMBLE
        // (bg=text-primary, color=bg-surface) → fort contraste dans les 2
        // thèmes. Avant : color #fff figé → invisible en dark (fond clair).
        background: 'var(--text-primary)',
        color: 'var(--bg-surface)',
        padding: '16px 20px',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-xl)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden style={{ fontSize: 20 }}>🍪</span>
      <p style={{ margin: 0, flex: 1 }}>
        On utilise uniquement les cookies essentiels au fonctionnement du site (session,
        panier, langue). Pas de tracking publicitaire.{' '}
        <a href="/legal/privacy" style={{ color: 'var(--bg-surface)', textDecoration: 'underline' }}>
          En savoir plus
        </a>.
      </p>
      <button
        type="button"
        onClick={accept}
        style={{
          padding: '8px 16px',
          background: 'var(--accent-primary)',
          // Round 43 #1 — text-on-accent bascule pour rester lisible sur le
          // vert clair du dark mode (#fff donnait ~1.8:1 sur #6FAE89).
          color: 'var(--text-on-accent)',
          border: 'none',
          borderRadius: 'var(--r-pill)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
        }}
      >
        OK, compris
      </button>
    </div>
  );
}
