'use client';

/**
 * WalletTopupForm — choisit un montant + redirect vers Stripe Checkout.
 *
 * Round 18 #1. Affiche les 3 tiers preset + un input custom. POST
 * /api/wallet/topup → checkoutUrl, on redirige.
 */

import { useState } from 'react';
import { WALLET_TIERS, MIN_TOPUP_CENTS, MAX_TOPUP_CENTS, computeBonus, tierForAmount } from '@/lib/wallet/tiers';

const PRESETS = WALLET_TIERS;

export default function WalletTopupForm() {
  const [selectedCents, setSelectedCents] = useState<number>(PRESETS[0]!.minAmountCents);
  const [customAmount, setCustomAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = !PRESETS.some((p) => p.minAmountCents === selectedCents);
  const amountCents = isCustom ? Math.round(parseFloat(customAmount || '0') * 100) : selectedCents;
  const bonus = computeBonus(amountCents);
  const tier = tierForAmount(amountCents);
  const total = amountCents + bonus;
  const isValid = amountCents >= MIN_TOPUP_CENTS && amountCents <= MAX_TOPUP_CENTS;

  async function handleSubmit() {
    if (!isValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setBusy(false);
    }
  }

  return (
    <section style={{
      padding: 24,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--r-xl)',
      marginBottom: 32,
    }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
        💳 Recharger ton wallet
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
        Prépaye et obtiens un bonus : plus tu charges, plus tu gagnes. Le crédit est utilisé avant
        le crédit de parrainage à ton prochain checkout.
      </p>

      <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        {PRESETS.map((p) => (
          <label
            key={p.minAmountCents}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              border: `${selectedCents === p.minAmountCents && !isCustom ? '2px' : '1px'} solid ${
                selectedCents === p.minAmountCents && !isCustom ? 'var(--accent-primary)' : 'var(--border-default)'
              }`,
              borderRadius: 'var(--r-md)',
              cursor: 'pointer',
              background: selectedCents === p.minAmountCents && !isCustom ? 'var(--accent-soft)' : 'var(--bg-canvas)',
            }}
          >
            <input
              type="radio"
              name="topup"
              checked={selectedCents === p.minAmountCents && !isCustom}
              onChange={() => { setSelectedCents(p.minAmountCents); setCustomAmount(''); }}
              disabled={busy}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {(p.minAmountCents / 100).toLocaleString('fr-CA')} $
                <span style={{ marginLeft: 8, color: 'var(--accent-primary)', fontWeight: 700, fontSize: 13 }}>
                  +{p.bonusPct} %
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Tu reçois <strong>{((p.minAmountCents + computeBonus(p.minAmountCents)) / 100).toLocaleString('fr-CA')} $</strong> de crédit
                (+{(computeBonus(p.minAmountCents) / 100).toLocaleString('fr-CA')} $ bonus)
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600 }}>
              {(p.minAmountCents / 100)} $
            </div>
          </label>
        ))}

        {/* Custom amount */}
        <label
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            border: `${isCustom ? '2px' : '1px'} solid ${isCustom ? 'var(--accent-primary)' : 'var(--border-default)'}`,
            borderRadius: 'var(--r-md)',
            cursor: 'pointer',
            background: isCustom ? 'var(--accent-soft)' : 'var(--bg-canvas)',
          }}
        >
          <input
            type="radio"
            name="topup"
            checked={isCustom}
            onChange={() => setSelectedCents(-1)} // -1 = sentinel pour custom
            disabled={busy}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Montant personnalisé</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={MIN_TOPUP_CENTS / 100}
                max={MAX_TOPUP_CENTS / 100}
                step={1}
                value={customAmount}
                onChange={(e) => { setSelectedCents(-1); setCustomAmount(e.target.value); }}
                placeholder="ex: 750"
                disabled={busy}
                style={{
                  width: 120,
                  padding: '6px 10px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 14,
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                $ ({MIN_TOPUP_CENTS / 100} – {(MAX_TOPUP_CENTS / 100).toLocaleString('fr-CA')})
              </span>
            </div>
            {isCustom && isValid && bonus > 0 && tier && (
              <div style={{ fontSize: 11, color: 'var(--accent-primary)', marginTop: 6 }}>
                Bonus tier appliqué : +{(bonus / 100).toFixed(2)} $ ({tier.bonusPct} %) → total {(total / 100).toFixed(2)} $
              </div>
            )}
            {isCustom && isValid && bonus === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Pas de bonus à ce niveau (minimum {(WALLET_TIERS[0]!.minAmountCents / 100)} $ pour le 1er tier)
              </div>
            )}
          </div>
        </label>
      </div>

      {error && (
        <div role="alert" style={{
          padding: 12,
          background: 'var(--danger-soft, #fef2f2)',
          color: 'var(--danger, #dc2626)',
          borderRadius: 'var(--r-sm)',
          fontSize: 13,
          marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!isValid || busy}
        style={{
          width: '100%',
          padding: '14px 24px',
          background: isValid ? 'var(--accent-primary)' : 'var(--text-muted)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--r-pill)',
          fontSize: 14,
          fontWeight: 600,
          cursor: isValid && !busy ? 'pointer' : 'not-allowed',
        }}
      >
        {busy
          ? 'Redirection vers Stripe…'
          : isValid
            ? `Payer ${(amountCents / 100).toFixed(2)} $ → recevoir ${(total / 100).toFixed(2)} $ de crédit`
            : 'Choisis un montant'}
      </button>
    </section>
  );
}
