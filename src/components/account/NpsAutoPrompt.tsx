/**
 * NpsAutoPrompt — modal d'invitation NPS qui s'affiche automatiquement
 * sur /account ≥ 14 j après le premier order DELIVERED quand l'user
 * n'a pas encore répondu.
 *
 * Logique côté serveur (cf. /account/page.tsx) :
 *   - Pull le 1er order DELIVERED dont updatedAt ≥ 14 j
 *   - Skip si npsResponse existe déjà
 *   - Skip si cookie `plio_nps_snooze` contient cet orderId (snooze 30 j)
 *   - Si tous les checks passent → render <NpsAutoPrompt orderId={...} />
 *
 * Cookie côté client : on snooze quand l'user dismiss "plus tard" pour
 * pas l'agresser à chaque page load. Submit = no cookie (server-side
 * NpsResponse fait le filter naturellement).
 */

'use client';

import { useEffect, useState } from 'react';

const SNOOZE_COOKIE = 'plio_nps_snooze';
const SNOOZE_DAYS = 30;

interface Props {
  orderId: string;
  /** Affiché dans le titre — ex: "ta commande #ABC123". */
  orderLabel: string;
}

export default function NpsAutoPrompt({ orderId, orderLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mount-time check du cookie de snooze. Si l'orderId est dedans →
  // ne pas open (l'user a dit "plus tard" il y a moins de 30j).
  useEffect(() => {
    const cookies = document.cookie.split('; ').reduce<Record<string, string>>((acc, c) => {
      const [k, v] = c.split('=');
      if (k && v) acc[k] = v;
      return acc;
    }, {});
    const snoozed = cookies[SNOOZE_COOKIE]?.split(',') ?? [];
    if (!snoozed.includes(orderId)) {
      // Petit délai pour éviter de pop dès le premier paint — sentiment moins agressif
      setTimeout(() => setOpen(true), 1200);
    }
  }, [orderId]);

  function snoozeAndClose() {
    const cookies = document.cookie.split('; ').reduce<Record<string, string>>((acc, c) => {
      const [k, v] = c.split('=');
      if (k && v) acc[k] = v;
      return acc;
    }, {});
    const snoozed = (cookies[SNOOZE_COOKIE]?.split(',') ?? []).filter(Boolean);
    if (!snoozed.includes(orderId)) snoozed.push(orderId);
    document.cookie = `${SNOOZE_COOKIE}=${snoozed.join(',')}; path=/; max-age=${SNOOZE_DAYS * 24 * 3600}; SameSite=Lax`;
    setOpen(false);
  }

  async function submit() {
    if (score === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/nps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, score, comment: comment.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setDone(true);
      // Auto-fermer après 2s pour pas bloquer l'user qui veut continuer
      setTimeout(() => setOpen(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nps-prompt-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        // Click sur le backdrop = snooze (pas perdre le state si user clique par accident)
        if (e.target === e.currentTarget) snoozeAndClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--r-xl, 16px)',
          padding: 32,
          maxWidth: 520,
          width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🙏</div>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
              fontWeight: 400,
            }}>
              Merci !
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
              Ton feedback nous aide énormément.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
              }}>
                ★ Ton avis compte
              </div>
              <button
                type="button"
                onClick={snoozeAndClose}
                aria-label="Plus tard"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 20,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <h2
              id="nps-prompt-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                letterSpacing: '-0.02em',
                margin: '0 0 12px',
                fontWeight: 400,
                lineHeight: 1.15,
              }}
            >
              Recommanderais-tu Plio à un collègue&nbsp;?
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
              30 secondes pour évaluer {orderLabel}. C&apos;est anonyme côté équipe et ça nous aide à nous améliorer.
            </p>

            {/* Score grid 0-10 — Round 30 #4 : min cell 36px + overflow scroll mobile */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, minmax(36px, 1fr))', gap: 4, marginBottom: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  aria-pressed={score === n}
                  style={{
                    padding: '10px 0',
                    borderRadius: 'var(--r-sm, 6px)',
                    border: '1px solid',
                    borderColor: score === n ? 'var(--accent-primary)' : 'var(--border-default)',
                    background: score === n ? 'var(--accent-primary)' : 'transparent',
                    color: score === n ? 'var(--text-on-accent, #fff)' : 'var(--text-primary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: 14,
                    transition: 'all 0.1s',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
              marginBottom: 20,
            }}>
              <span>Très peu probable</span>
              <span>Extrêmement probable</span>
            </div>

            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
                marginBottom: 6,
              }}>
                Pourquoi ce score ? (optionnel)
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Ce qui a bien marché, ou ce qu'on pourrait améliorer…"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-sm, 6px)',
                  fontSize: 14,
                  font: 'inherit',
                  resize: 'vertical',
                  background: 'var(--bg-canvas)',
                  color: 'var(--text-primary)',
                  lineHeight: 1.5,
                }}
              />
            </label>

            {error && (
              <div role="alert" style={{
                padding: 12,
                background: 'var(--danger-soft, #fef2f2)',
                color: 'var(--danger, #dc2626)',
                borderRadius: 'var(--r-sm)',
                fontSize: 13,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <button
                type="button"
                onClick={snoozeAndClose}
                className="btn btn-secondary"
              >
                Plus tard
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={score === null || submitting}
                className="btn btn-primary"
                style={{ opacity: score === null || submitting ? 0.5 : 1 }}
              >
                {submitting ? 'Envoi…' : 'Envoyer mon avis'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
