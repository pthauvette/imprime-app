'use client';

/**
 * Onboarding tour pour les 1ères visites — affiché 1x.
 *
 * Storage : cookie 'plio_tour' (1 an). Si absent, affiche un modal après
 * un délai (laisse le hero respirer 2s, sinon c'est agressif).
 *
 * UX : modal centré, 4 steps. Pas un highlight de chaque élément (trop
 * fragile, casse au moindre redesign) — plutôt une explication claire
 * de la value prop avec CTA contextuels vers les vraies pages.
 *
 * Steps :
 *   1. Welcome — Plio en 30 sec
 *   2. Quote instant — 2 minutes pour avoir un prix
 *   3. Samples — touche le papier avant
 *   4. Devis sur-mesure si on a besoin de plus
 *
 * Le user peut "skip" à tout moment (X en haut à droite OU "Plus tard").
 *
 * Quand on s'inscrit (account, sign-up), on devrait skip ça automatiquement
 * — mais pour MVP, le cookie suffit (set quand on a déjà passé une commande
 * via le wizard, par exemple, ailleurs dans l'app).
 */

import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import Link from 'next/link';
import type { Route } from 'next';

const TOUR_COOKIE = 'plio_tour';
const TOUR_MAX_AGE = 365 * 24 * 60 * 60;
const TOUR_DELAY_MS = 2500;

interface TourStep {
  emoji: string;
  title: string;
  body: string;
  cta?: { label: string; href: Route };
}

const STEPS: TourStep[] = [
  {
    emoji: '👋',
    title: 'Bienvenue sur Plio.',
    body: 'On imprime tes cartes, flyers et brochures au Canada — prix transparent, livraison rapide. Petit tour rapide pour te montrer comment ça marche ?',
  },
  {
    emoji: '⚡',
    title: 'Devis instantané en 2 minutes',
    body: 'Notre wizard te calcule un prix exact en temps réel. Quantité, papier, finition — tu vois le total se mettre à jour à chaque clic. Pas de minimum, pas de surprise.',
    cta: { label: 'Essayer le wizard →', href: '/order/start' as Route },
  },
  {
    emoji: '✋',
    title: 'Touche avant d\'acheter',
    body: 'Tu hésites entre 14pt et 16pt ? On t\'envoie un kit d\'échantillons gratuit pour comparer en vrai — pas de mauvaise surprise quand tu reçois ta commande.',
    cta: { label: 'Demander des échantillons →', href: '/samples' as Route },
  },
  {
    emoji: '📋',
    title: 'Projet hors catalogue ?',
    body: 'Grande quantité, signage, packaging, papier spécifique — on quote ce qui sort du wizard, sous 1-2 jours ouvrables.',
    cta: { label: 'Demander un devis sur-mesure →', href: '/quote' as Route },
  },
];

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Round 7 #1/#2 — piège le focus dans le modal + restaure au déclencheur.
  useFocusTrap(dialogRef, visible);

  useEffect(() => {
    const has = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith(`${TOUR_COOKIE}=`));
    if (!has) {
      const t = setTimeout(() => setVisible(true), TOUR_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, []);

  function persistAndClose() {
    document.cookie = `${TOUR_COOKIE}=ok; path=/; max-age=${TOUR_MAX_AGE}; SameSite=Lax`;
    setVisible(false);
  }

  function next() {
    if (step >= STEPS.length - 1) {
      persistAndClose();
    } else {
      setStep((s) => s + 1);
    }
  }

  function prev() {
    setStep((s) => Math.max(0, s - 1));
  }

  // Round 7 #2 — Escape ferme le tour (avant : fermable souris uniquement).
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') persistAndClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        // Click outside = skip (mais persiste, vu qu'ils ont vu la 1ère card)
        if (e.target === e.currentTarget) persistAndClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg-canvas, #fff)',
          maxWidth: 480,
          width: '100%',
          borderRadius: 'var(--r-xl, 16px)',
          padding: '40px 32px 28px',
          position: 'relative',
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
        }}
      >
        <button
          type="button"
          onClick={persistAndClose}
          aria-label="Fermer le tour"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'transparent',
            border: 'none',
            fontSize: 24,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            lineHeight: 1,
            padding: 8,
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>

        <div
          aria-hidden
          style={{
            display: 'flex',
            gap: 6,
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === step ? 24 : 8,
                height: 8,
                borderRadius: 4,
                background: i === step ? 'var(--accent-primary)' : 'var(--border-default)',
                transition: 'width 0.2s',
              }}
            />
          ))}
        </div>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }} aria-hidden>{current.emoji}</div>
          <h2
            id="tour-title"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 24,
              fontWeight: 400,
              margin: '0 0 12px',
              color: 'var(--text-primary)',
            }}
          >
            {current.title}
          </h2>
          <p
            style={{
              fontSize: 15,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {current.body}
          </p>
        </div>

        {current.cta && (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <Link
              href={current.cta.href}
              onClick={persistAndClose}
              className="btn btn-primary"
              style={{ display: 'inline-block', textDecoration: 'none' }}
            >
              {current.cta.label}
            </Link>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          {step > 0 ? (
            <button
              type="button"
              onClick={prev}
              className="btn btn-ghost btn-sm"
              style={{ fontFamily: 'inherit' }}
            >
              ← Précédent
            </button>
          ) : (
            <button
              type="button"
              onClick={persistAndClose}
              className="btn btn-ghost btn-sm"
              style={{ fontFamily: 'inherit', color: 'var(--text-muted)' }}
            >
              Plus tard
            </button>
          )}

          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {step + 1} / {STEPS.length}
          </span>

          <button
            type="button"
            onClick={next}
            className="btn btn-primary btn-sm"
            style={{ fontFamily: 'inherit' }}
          >
            {isLast ? 'Compris ✓' : 'Suivant →'}
          </button>
        </div>
      </div>
    </div>
  );
}
