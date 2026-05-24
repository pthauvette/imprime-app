'use client';

/**
 * NPS widget customer — affiché sur /orders/[id] quand status=DELIVERED.
 *
 * Flow :
 *   1. Bouton CTA "Donner mon avis (0-10)"
 *   2. Click → modal avec 0-10 button grid + textarea optional
 *   3. Submit → POST /api/nps
 *   4. Success → thank-you state, modal stay
 *
 * Si l'user a déjà répondu (existingScore prop set), on affiche le score
 * existant + option de modifier ("Tu as donné X/10 · modifier").
 */

import { useState } from 'react';

interface Props {
  orderId: string;
  existingScore: number | null;
  existingComment: string | null;
}

export default function NpsWidget({ orderId, existingScore, existingComment }: Props) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(existingScore);
  const [comment, setComment] = useState(existingComment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submittedScore, setSubmittedScore] = useState<number | null>(existingScore);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (score === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/nps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          score,
          comment: comment.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSubmittedScore(score);
      // Garde la modal ouverte 2s pour montrer le thank-you, puis close
      setTimeout(() => setOpen(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost"
        style={{ fontSize: 13 }}
      >
        {submittedScore !== null
          ? `✓ Tu as donné ${submittedScore}/10 · modifier`
          : '💬 Donner mon avis'}
      </button>

      {open && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20, 28, 22, 0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--r-xl)',
              padding: 32,
              maxWidth: 520,
              width: '100%',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h3
              style={{
                margin: '0 0 8px',
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                fontWeight: 400,
                letterSpacing: '-0.02em',
              }}
            >
              Tu recommanderais Plio ?
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Sur une échelle de 0 (jamais de la vie) à 10 (immédiatement),
              tu recommanderais Plio à un·e collègue ?
            </p>

            {/* Round 30 #4 — NPS 0-10 : sur mobile <420px, 11 cellules de 1fr
                deviennent ~30px chacune (impossible à tapper, < seuil 40px).
                Min cell width 36px + overflow horizontal pour garantir
                tap-friendliness sans break la numérotation 0..10. */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(11, minmax(36px, 1fr))',
                gap: 4,
                marginBottom: 8,
                overflowX: 'auto',
                paddingBottom: 4,
              }}
            >
              {Array.from({ length: 11 }, (_, i) => {
                const selected = score === i;
                const tone = i <= 6 ? 'danger' : i <= 8 ? 'warning' : 'success';
                const bgVar =
                  tone === 'danger'
                    ? 'var(--danger-soft, #fef2f2)'
                    : tone === 'warning'
                      ? 'var(--warning-soft, #FFF6E5)'
                      : 'var(--success-soft, #f0fdf4)';
                const colorVar =
                  tone === 'danger'
                    ? 'var(--danger, #dc2626)'
                    : tone === 'warning'
                      ? 'var(--warning, #D97706)'
                      : 'var(--success, #16a34a)';
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setScore(i)}
                    aria-label={`Score ${i} sur 10`}
                    style={{
                      padding: '12px 0',
                      background: selected ? colorVar : bgVar,
                      color: selected ? 'white' : colorVar,
                      border: `1px solid ${colorVar}`,
                      borderRadius: 'var(--r-sm)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.1s',
                    }}
                  >
                    {i}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                marginBottom: 24,
              }}
            >
              <span>Jamais</span>
              <span>Probablement</span>
              <span>Immédiatement</span>
            </div>

            <label style={{ display: 'grid', gap: 6, marginBottom: 20 }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                Pourquoi cette note ? <span style={{ textTransform: 'none', color: 'var(--text-muted)', fontWeight: 400 }}>(optionnel)</span>
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Qu'est-ce qui t'a plu / déplu ?"
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  resize: 'vertical',
                  background: 'var(--bg-canvas)',
                }}
              />
            </label>

            {error && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 14px',
                  background: 'var(--danger-soft, #fef2f2)',
                  border: '1px solid var(--danger, #dc2626)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  color: 'var(--danger, #dc2626)',
                }}
              >
                ⚠ {error}
              </div>
            )}

            {submittedScore !== null && submittedScore === score ? (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--success-soft, #f0fdf4)',
                  border: '1px solid var(--success, #16a34a)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13,
                  color: 'var(--success, #16a34a)',
                  fontWeight: 500,
                  textAlign: 'center',
                }}
              >
                ✓ Merci pour ton feedback !
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn btn-ghost"
                  disabled={submitting}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={submit}
                  className="btn btn-primary"
                  disabled={submitting || score === null}
                >
                  {submitting ? 'Envoi…' : 'Envoyer'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
