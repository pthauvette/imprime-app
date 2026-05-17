'use client';

import { useState } from 'react';

export default function ReviewSubmitForm({
  orderId,
  token,
  defaultName,
  productSummary,
}: {
  orderId: string;
  token: string;
  defaultName: string;
  productSummary: string;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [displayName, setDisplayName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/reviews/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          token,
          rating,
          comment: comment.trim() || undefined,
          displayName: displayName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{ padding: 32, background: 'var(--success-soft, #f0fdf4)', border: '1px solid var(--success, #16a34a)', borderRadius: 'var(--r-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
        <h2 style={{ margin: '8px 0', fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400 }}>Merci !</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Ton avis est en modération — il sera publié dans les 24h ouvrables.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
          Avis sur ta commande
        </div>
        <h1 style={{ margin: '8px 0 12px', fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em', fontWeight: 400 }}>
          Comment c&apos;était ?
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          {productSummary} · ça nous aide à nous améliorer (et à rassurer les prochains clients).
        </p>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: 24, display: 'grid', gap: 20 }}>
        <label style={{ display: 'grid', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
            Ta note
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 36,
                  cursor: 'pointer',
                  padding: 0,
                  color: n <= rating ? '#F5C95E' : 'var(--text-muted)',
                  transition: 'color 0.15s',
                }}
              >
                ★
              </button>
            ))}
          </div>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
            Ton avis (optionnel)
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Qu'est-ce qui t'a marqué ? Qualité d'impression, délai, service ? Sois honnête — on lit tout."
            style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
            Nom affiché publiquement (modifiable)
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            style={{ padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 13 }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Ex: « Sophie B. » plutôt que « Sophie Beauchamp » — c&apos;est ton choix.
          </span>
        </label>

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--danger)' }}>
            ✗ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary"
          style={{ opacity: submitting ? 0.5 : 1 }}
        >
          {submitting ? 'Envoi…' : 'Publier mon avis'}
        </button>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
          Ton avis est modéré avant publication (~24h ouvrables). On affichera ton nom (modifié si tu l&apos;as changé), ta note et ton commentaire. Aucune autre info personnelle n&apos;est partagée.
        </p>
      </div>
    </form>
  );
}
