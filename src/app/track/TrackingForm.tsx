'use client';

/**
 * TrackingForm — Client Component qui owns le form + le résultat.
 *
 * POST → /api/track (vs GET avec email en query) pour éviter de logger
 * l'email du customer dans les access logs server + referrer headers.
 *
 * State machine simple :
 *   - 'idle' : form vide ou rempli, pas soumis
 *   - 'loading' : POST in-flight, button désactivé
 *   - 'success' : on affiche la timeline + tracking
 *   - 'error' : on affiche le message d'erreur de l'API (404 / 429 / 500)
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
// Round 38 #1 — Source canonique (Round 37 #5 extract)
import { statusLabel } from '@/lib/orders/status-labels';

interface TimelineStep {
  label: string;
  description: string;
  done: boolean;
  current: boolean;
  timestamp: string | null;
}

interface TrackingInfo {
  number: string;
  carrier: string;
  url?: string;
}

interface OrderResult {
  displayNumber: string;
  status: string;
  placedAt: string;
  firstName: string | null;
  timeline: TimelineStep[];
  tracking: TrackingInfo | null;
  eta: { day: string; relative: string } | null;
}

export default function TrackingForm() {
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);

  // Round 24 #5 — pré-remplir orderNumber depuis ?orderId=X
  // (email reste à taper manuellement, c'est PII donc jamais en URL).
  // Set seulement au mount, pour pas écraser ce que le user tape.
  useEffect(() => {
    const fromUrl = searchParams.get('orderId');
    if (fromUrl) setOrderNumber(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setError(null);

    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, email }),
      });
      const data = (await res.json()) as
        | { ok: true; order: OrderResult }
        | { error: string };

      if (!res.ok) {
        setStatus('error');
        setError('error' in data ? data.error : 'Erreur inconnue. Réessaye.');
        setResult(null);
        return;
      }

      setStatus('success');
      setResult('order' in data ? data.order : null);
    } catch {
      setStatus('error');
      setError('Erreur de connexion. Vérifie ta connexion internet.');
      setResult(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <form
        onSubmit={onSubmit}
        style={{
          display: 'grid',
          gap: 14,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--r-lg)',
          padding: 24,
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
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
            Numéro de commande
          </span>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="Ex: SIN-48312"
            required
            autoComplete="off"
            disabled={status === 'loading'}
            style={{
              padding: '10px 12px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              fontSize: 16, // ≥16px : anti-zoom iOS (audit mobile 3.3)
              fontFamily: 'var(--font-mono)',
            }}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
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
            Email utilisé pour la commande
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton@email.ca"
            required
            autoComplete="email"
            disabled={status === 'loading'}
            style={{
              padding: '10px 12px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              fontSize: 14,
            }}
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={status === 'loading' || !orderNumber.trim() || !email.trim()}
          style={{ marginTop: 4 }}
        >
          {status === 'loading' ? 'Recherche…' : 'Suivre ma commande →'}
        </button>
      </form>

      {status === 'error' && error && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: '16px 20px',
            background: 'var(--danger-soft, #fef2f2)',
            border: '1px solid var(--danger, #dc2626)',
            borderRadius: 'var(--r-md)',
            fontSize: 14,
            color: 'var(--text-primary)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--danger, #dc2626)' }}>⚠ </strong>
          {error}
        </div>
      )}

      {status === 'success' && result && <TrackResult order={result} />}

      {status === 'idle' && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            textAlign: 'center',
          }}
        >
          Tu as un compte ?{' '}
          <Link href={'/sign-in' as Route} style={{ color: 'var(--accent-primary)' }}>
            Connecte-toi
          </Link>{' '}
          pour voir toutes tes commandes.
        </div>
      )}
    </div>
  );
}

function TrackResult({ order }: { order: OrderResult }) {
  const statusLabelText = statusLabel(order.status);

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
        padding: 24,
        display: 'grid',
        gap: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
            }}
          >
            {order.firstName ? `Bonjour ${order.firstName}` : 'Commande'}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              letterSpacing: '-0.02em',
              fontWeight: 400,
            }}
          >
            {order.displayNumber}
          </div>
        </div>
        <span
          style={{
            padding: '6px 14px',
            background: statusBg(order.status),
            color: statusColor(order.status),
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {statusLabelText}
        </span>
      </div>

      {order.eta && (
        <div
          style={{
            padding: '14px 18px',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--r-md)',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {order.status === 'DELIVERED' ? (
            <>✓ Livrée le <strong>{order.eta.day}</strong>.</>
          ) : (
            <>
              ETA : <strong>{order.eta.day}</strong> ({order.eta.relative})
            </>
          )}
        </div>
      )}

      {order.tracking && (
        <div
          style={{
            padding: '14px 18px',
            background: 'var(--bg-sunken)',
            borderRadius: 'var(--r-md)',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.04em' }}>
              {order.tracking.carrier.toUpperCase()}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>
              {order.tracking.number}
            </div>
          </div>
          {order.tracking.url && (
            <a
              href={order.tracking.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ fontSize: 13 }}
            >
              Voir sur {order.tracking.carrier} →
            </a>
          )}
        </div>
      )}

      {/* Timeline */}
      <div style={{ display: 'grid', gap: 14 }}>
        {order.timeline.map((step, i) => (
          <TimelineRow key={i} step={step} isLast={i === order.timeline.length - 1} />
        ))}
      </div>

      <div
        style={{
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: 12,
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}
      >
        Tu veux modifier ou annuler ?{' '}
        <Link href={'/sign-in' as Route} style={{ color: 'var(--accent-primary)' }}>
          Connecte-toi
        </Link>{' '}
        avec cet email pour accéder aux actions.
      </div>
    </div>
  );
}

function TimelineRow({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
  const dotColor = step.done
    ? 'var(--accent-primary)'
    : step.current
      ? 'var(--accent-primary)'
      : 'var(--border-default)';
  const lineColor = step.done ? 'var(--accent-primary)' : 'var(--border-subtle)';

  return (
    <div style={{ display: 'flex', gap: 14, position: 'relative' }}>
      <div
        style={{
          width: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: dotColor,
            border: step.current ? '3px solid var(--accent-soft)' : 'none',
            outline: step.current ? '2px solid var(--accent-primary)' : 'none',
            outlineOffset: step.current ? -2 : 0,
            transition: 'all 0.2s',
          }}
        />
        {!isLast && (
          <div
            style={{
              flex: 1,
              width: 2,
              background: lineColor,
              marginTop: 4,
              minHeight: 20,
            }}
          />
        )}
      </div>
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 4 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: step.current ? 600 : step.done ? 500 : 400,
            color: step.done || step.current ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
        >
          {step.label}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {step.description}
        </div>
        {step.timestamp && (
          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              marginTop: 4,
            }}
          >
            {step.timestamp}
          </div>
        )}
      </div>
    </div>
  );
}

function statusBg(s: string): string {
  switch (s) {
    case 'PAID':
    case 'SUBMITTED':
    case 'IN_PRODUCTION':
      return 'var(--accent-soft)';
    case 'SHIPPED':
    case 'DELIVERED':
      return 'var(--success-soft, #f0fdf4)';
    case 'CANCELLED':
    case 'FAILED':
      return 'var(--danger-soft)';
    default:
      return 'var(--bg-sunken)';
  }
}

function statusColor(s: string): string {
  switch (s) {
    case 'PAID':
    case 'SUBMITTED':
    case 'IN_PRODUCTION':
      return 'var(--accent-primary)';
    case 'SHIPPED':
    case 'DELIVERED':
      return 'var(--success, #16a34a)';
    case 'CANCELLED':
    case 'FAILED':
      return 'var(--danger)';
    default:
      return 'var(--text-muted)';
  }
}
