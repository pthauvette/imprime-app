'use client';

/**
 * Bouton flottant "Besoin d'aide ?" persistant sur les pages du wizard +
 * confirmation. Click ouvre un modal contact rapide (nom, email, message)
 * qui POST /api/contact — même backend que la page /contact officielle,
 * mais sans faire perdre à l'user le state du wizard.
 *
 * Auto-fills email si user connecté (passé en prop par le parent server
 * component, ou laissé vide pour les guests).
 *
 * Position : fixed bottom-right, z-index élevé pour passer au-dessus du
 * sticky footer du wizard. Mobile : full-width sheet.
 */

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SUPPORT_SLA } from '@/lib/content/marketing';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { Icon } from '@/components/ui/Icon';

interface Props {
  /** Contexte additionnel auto-ajouté au message (ex: "Étape 4 — Qté 500"). */
  contextHint?: string;
}

export default function FloatingHelpButton({
  contextHint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Audit-vérif M1 — le préremplissage nom/email vient désormais du CLIENT
  // (fetch /api/auth/session avec le cookie du vrai visiteur), PLUS du SSR. Rendre
  // la session en SSR sur /order/* (route publique, anonyme) fuyait la PII d'un
  // autre user quand le runtime Amplify resservait un rendu inter-requêtes — même
  // anti-pattern que HeaderUserSlot (#197/#198). Inputs contrôlés pour que la
  // valeur fetchée s'affiche même après le mount.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  // Round 7 #1 — focus-trap + restore (le modal a déjà Escape ci-dessous).
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ user?: { email?: string | null; name?: string | null } }>) : null))
      .then((data) => {
        if (cancelled || !data?.user) return;
        // Ne pas écraser ce que l'utilisateur a déjà tapé.
        setName((cur) => cur || data.user?.name || '');
        setEmail((cur) => cur || data.user?.email || '');
      })
      .catch(() => { /* best-effort : l'utilisateur tapera ses infos */ });
    return () => { cancelled = true; };
  }, []);

  // Lock body scroll when open + ESC to close
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '');
    const email = String(form.get('email') ?? '');
    const messageRaw = String(form.get('message') ?? '');
    const message = contextHint
      ? `${messageRaw}\n\n—\nContexte : ${contextHint}\nURL : ${typeof window !== 'undefined' ? window.location.href : ''}`
      : messageRaw;
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          subject: contextHint ? `[Wizard] ${contextHint}` : '[Aide] Demande depuis le bouton flottant',
          message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  // Audit mobile 5.5 — masquer le FAB sur la page de PAIEMENT : un bouton flottant
  // bottom-right chevauche le bouton « payer » (full-width en bas du recap sur
  // mobile). Sur un CTA aussi critique, l'overlay nuit > il n'aide.
  if (pathname === '/order/review') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Besoin d'aide ?"
        className="help-fab"
        style={{
          position: 'fixed',
          // Safe-area iOS (home indicator) — le repo déclare viewportFit:cover.
          bottom: 'calc(24px + env(safe-area-inset-bottom))',
          right: 24,
          zIndex: 100,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 18px',
          background: 'var(--accent-primary)',
          color: 'var(--text-on-accent, #fff)',
          border: 'none',
          borderRadius: 'var(--r-pill)',
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-lg)',
          transition: 'transform var(--dur-fast), box-shadow var(--dur-fast)',
        }}
      >
        <Icon name="chat" size={16} />
        Besoin d&apos;aide ?
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20, 28, 22, 0.55)',
            display: 'grid',
            placeItems: 'end',
            padding: '24px',
            zIndex: 200,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            ref={dialogRef as never}
            style={{
              width: '100%',
              maxWidth: 460,
              background: 'var(--bg-surface)',
              borderRadius: 'var(--r-xl)',
              padding: 28,
              boxShadow: 'var(--shadow-xl)',
              display: 'grid',
              gap: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Support Plio
                </div>
                <h2 id="help-modal-title" style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, letterSpacing: '-0.01em', margin: '4px 0 6px' }}>
                  Comment on peut <em>t&apos;aider ?</em>
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  Question sur ta commande, un produit ou un fichier ? On répond en {SUPPORT_SLA}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
              >
                ×
              </button>
            </div>

            {sent ? (
              <div
                role="status"
                style={{
                  padding: 20,
                  background: 'var(--success-soft, #f0fdf4)',
                  border: '1px solid var(--success, #16a34a)',
                  borderRadius: 'var(--r-md)',
                  textAlign: 'center',
                }}
              >
                <div style={{ marginBottom: 4 }}><Icon name="check" size={32} /></div>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>
                  Message envoyé. On te répond à <strong>{email || 'l\'adresse fournie'}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 12 }}
                >
                  Fermer
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Nom
                  </span>
                  <input
                    type="text"
                    name="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={150}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Email
                  </span>
                  <input
                    type="email"
                    name="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={150}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Message
                  </span>
                  <textarea
                    name="message"
                    required
                    minLength={10}
                    maxLength={5000}
                    rows={4}
                    placeholder="Dis-nous ce qui te bloque…"
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </label>
                {contextHint && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '6px 10px', background: 'var(--bg-canvas)', borderRadius: 'var(--r-sm)' }}>
                    Contexte ajouté : {contextHint}
                  </div>
                )}
                {error && (
                  <div role="alert" style={{ padding: '8px 12px', background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 'var(--r-sm)', fontSize: 12 }}>
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{ opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? 'Envoi…' : 'Envoyer le message'}
                </button>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                  Ou écris-nous direct à{' '}
                  <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a>
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-sm)',
  fontSize: 14,
  font: 'inherit',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
};
