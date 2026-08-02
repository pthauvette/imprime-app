'use client';

/**
 * WizardCartLink — indicateur de panier pour l'en-tête du wizard.
 *
 * finding audit UI/UX 2026-08 (demandé par Patrick) — le panier EXISTE bien
 * (`lib/cart/store`, jusqu'à 10 articles, persisté en localStorage et
 * consommé par /order/review), mais n'était visible NULLE PART dans la
 * navigation : un client qui avait déjà mis un article de côté n'avait aucun
 * moyen de le savoir ni d'y revenir avant l'étape de paiement.
 *
 * Rendu UNIQUEMENT quand le panier contient quelque chose : afficher « 0 »
 * en permanence dans un tunnel mono-produit ajouterait du bruit sans rien
 * apprendre. Dès qu'il y a un article, le compteur devient une vraie
 * affordance de retour.
 *
 * Le compte n'est PAS lu au premier rendu serveur : `useCart` s'hydrate
 * depuis localStorage, indisponible en SSR. On attend donc le montage avant
 * d'afficher quoi que ce soit — sinon le HTML serveur (panier vide) et le
 * HTML client (panier plein) divergent et React jette une erreur
 * d'hydratation. Le hook écoute déjà `plio:cart:updated` et l'événement
 * `storage`, donc le compteur suit les ajouts faits dans un AUTRE onglet.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useCart } from '@/lib/cart/store';
import { Icon } from '@/components/ui/Icon';

export default function WizardCartLink() {
  const { count } = useCart();
  const [monte, setMonte] = useState(false);

  useEffect(() => setMonte(true), []);

  if (!monte || count === 0) return null;

  return (
    <Link
      href={'/order/review' as Route}
      aria-label={`Panier — ${count} article${count > 1 ? 's' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 'var(--r-pill)',
        background: 'var(--bg-sunken)',
        border: '1px solid var(--border-default)',
        color: 'var(--text-primary)',
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name="cart" size={15} aria-hidden />
      <span style={{ fontFamily: 'var(--font-mono)' }}>{count}</span>
    </Link>
  );
}
