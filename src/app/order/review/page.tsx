/**
 * /order/review?productId=N&options=...&files=...&ship=... — Step 7 wizard.
 *
 * 1. POST /api/orders/create avec tout le state → reçoit clientSecret + breakdown
 * 2. Render Stripe Elements PaymentElement
 * 3. À la confirmation → stripe.confirmPayment() redirige vers /order/confirmation
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useCart, type CartItem } from '@/lib/cart/store';
import { Icon } from '@/components/ui/Icon';
import ProductMockup from '@/components/wizard/ProductMockup';
import { mockupForProductName, specForProductName } from '@/lib/products/product-mockup';
import ClientHeaderUserSlot from '@/components/account/ClientHeaderUserSlot';

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY manquante');
    return null;
  }
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

interface ShipState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  method: string;
  price: number;
  /** Round 1 audit — sig HMAC du devis de livraison (anti-tamper côté create). */
  sig?: string;
  /** Round 26 #2 — instructions livraison (max 200 chars). Optional. */
  note?: string;
}

interface Breakdown {
  subtotal: number;
  /** Montant remisé via code promo (toujours présent, 0 si pas de promo). */
  discount: number;
  /** Code promo appliqué, ou null. */
  promoCode: string | null;
  /** Round 30 #1 — Reseller VERIFIED discount (5 %), 0 si non-reseller. */
  resellerDiscount?: number;
  resellerDiscountLabel?: string | null;
  shipping: number;
  /** Prix de livraison original avant perks (cf. perks.goldFreeShipping). Optionnel. */
  originalShipping?: number;
  tax: number;
  taxLines: { code: string; label: string; rate: number; amount: number }[];
  /** Round 30 #1 — Crédit wallet appliqué (déjà déduit du total Stripe). */
  walletCredit?: number;
  /** Round 30 #1 — Crédit referral appliqué (déjà déduit du total Stripe). */
  referralCredit?: number;
  /** Round 30 #1 — Total brut avant wallet/referral. */
  grossTotal?: number;
  /** Total réel débité par Stripe (= grossTotal − wallet − referral). */
  total: number;
  currency: string;
  /** Perks appliqués server-side (Round 13 #5). */
  perks?: {
    goldFreeShipping: boolean;
    loyaltyTier: string | null;
  };
}

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewPageInner />
    </Suspense>
  );
}

function ReviewPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get('productId');
  const optionsParam = searchParams.get('options') ?? '';
  const filesParam = searchParams.get('files') ?? '';
  const shipParam = searchParams.get('ship');
  const designId = searchParams.get('designId');

  // Cart : items ajoutés via "Ajouter un autre produit" lors de runs
  // précédents du wizard. L'item COURANT (URL params) est ajouté à la
  // soumission mais pas au cart tant que l'user n'a pas explicitement
  // cliqué "Ajouter un autre produit".
  const cart = useCart();

  const ship: ShipState | null = useMemo(() => {
    if (!shipParam) return null;
    try { return JSON.parse(shipParam); } catch { return null; }
  }, [shipParam]);

  // Reconstruit l'item courant depuis l'URL pour les soumissions + display
  const currentItem = useMemo(() => {
    if (!productId) return null;
    const optionIds = optionsParam.split(',').filter(Boolean).map(Number);
    const files = filesParam
      .split('|')
      .filter(Boolean)
      .map((f) => {
        const idx = f.indexOf(':');
        const type = f.slice(0, idx);
        const url = f.slice(idx + 1);
        return { type: type as 'front' | 'back', url: decodeURIComponent(url) };
      });
    return { productId: Number(productId), optionIds, files, designId: designId ?? undefined };
  }, [productId, optionsParam, filesParam, designId]);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Audit-vérif Funnel #2 — nonce STABLE par tentative de checkout (1 par montage
  // de cette page). Envoyé à /api/orders/create comme base de la clé d'idempotence
  // Stripe : un retry réutilise la même clé (pas de double PaymentIntent), un
  // rechargement de page démarre une nouvelle tentative (re-commande possible).
  const idempotencyKey = useMemo(() => {
    try { return crypto.randomUUID(); }
    catch { return `att-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  }, []);

  // Promo code : code appliqué + status (ok/error/checking) + message FR
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);

  // Round 3 #5 — vrai nom + prix de l'item courant, pour enrichir le snapshot
  // cart quand on « Ajoute un autre » (sinon « Produit #ID · 0 $ » → récap peu
  // rassurant à l'écran de paiement). Best-effort : si pas encore résolu,
  // handleAddAnother retombe sur le placeholder. Le nom vient du GET
  // /api/products/[id] (product.name), le prix du POST (variante, en dollars).
  const [currentSnapshot, setCurrentSnapshot] = useState<{
    productName: string;
    unitPriceCents: number;
  } | null>(null);

  // Handler : sauve l'item courant dans le cart + navigate vers /order/start
  // pour que l'user puisse en ajouter un autre. Pas de double-add si l'user
  // refait le flow et arrive à /order/review avec ces mêmes params.
  function handleAddAnother() {
    if (!currentItem) return;
    if (cart.isFull) {
      // Round 30 #5 — Avant: alert() jarring. La panel inline cart.isFull
      // (ligne ~333) affiche déjà le message + email contact. Le button
      // qui call handleAddAnother est lui-même hidden quand cart.isFull,
      // donc cette branche est défensive — silently no-op.
      return;
    }
    // Snapshot enrichi avec le vrai nom + prix (currentSnapshot, résolu ci-dessus)
    // pour un récap multi-item rassurant. Fallback placeholder si pas encore
    // résolu. Le prix reste de toute façon recalculé serveur-side au submit.
    cart.add({
      productId: currentItem.productId,
      productName: currentSnapshot?.productName ?? `Produit #${currentItem.productId}`,
      optionIds: currentItem.optionIds,
      optionLabels: [],
      qty: 1, // qty réelle est encodée dans optionIds (Sinalite)
      unitPriceCents: currentSnapshot?.unitPriceCents ?? 0, // recalculé serveur-side au submit
      files: currentItem.files,
      ...(currentItem.designId ? { designId: currentItem.designId } : {}),
    });
    // Navigate vers /order/start mais préserve l'adresse de livraison dans
    // localStorage si elle existe (à wirer plus tard — pour MVP user re-saisit).
    router.push('/order/start' as Route);
  }

  // Build le tableau complet des items à submit : cart + item courant
  const allItems = useMemo(() => {
    const cartItems = cart.items.map((it) => ({
      productId: it.productId,
      optionIds: it.optionIds,
      files: it.files,
      designId: it.designId,
    }));
    if (currentItem) {
      return [...cartItems, currentItem];
    }
    return cartItems;
  }, [cart.items, currentItem]);

  // Round 9 #5 — clé de CONTENU stable. Le PaymentIntent doit se recréer dès que
  // le contenu du panier change, pas seulement quand le NOMBRE d'items change
  // (avant : dépendance sur allItems.length → une mutation à count égal — swap
  // de produit, retrait d'un item qui décale currentItem — passait inaperçue, et
  // le montant Stripe pouvait diverger du panier réel).
  const allItemsKey = useMemo(
    () =>
      allItems
        .map(
          (it) =>
            `${it.productId}|${it.optionIds.join(',')}|${(it.files ?? [])
              .map((f) => f.url)
              .join(',')}|${it.designId ?? ''}`,
        )
        .join('||'),
    [allItems],
  );

  // Résout nom + prix réels de l'item courant (pour le snapshot cart). GET pour
  // le nom, POST (avec optionIds) pour le prix de la variante. Best-effort.
  useEffect(() => {
    if (!currentItem) return;
    let cancelled = false;
    (async () => {
      try {
        const [gRes, pRes] = await Promise.all([
          fetch(`/api/products/${currentItem.productId}`),
          fetch(`/api/products/${currentItem.productId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ optionIds: currentItem.optionIds }),
          }),
        ]);
        const g = gRes.ok ? await gRes.json() : null;
        const p = pRes.ok ? await pRes.json() : null;
        if (cancelled) return;
        const name = (g?.product?.name as string | undefined)?.trim();
        const priceDollars = Number(p?.price);
        setCurrentSnapshot({
          productName: name || `Produit #${currentItem.productId}`,
          unitPriceCents: Number.isFinite(priceDollars) ? Math.round(priceDollars * 100) : 0,
        });
      } catch {
        // garde le fallback placeholder dans handleAddAnother
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentItem]);

  // Create PaymentIntent on mount
  useEffect(() => {
    if (allItems.length === 0 || !ship) {
      setError('Données manquantes — recommence le wizard.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      // H2 audit v3 — reset au début de CHAQUE run. L'effet re-tourne à chaque
      // mutation du panier (« Retirer » → dep allItemsKey) ou de promo. Sans ce
      // reset, un re-create qui ÉCHOUE (ré-estimation shipping full-cart qui throw,
      // méthode disparue, 409 serveur) laissait l'ANCIEN clientSecret/breakdown
      // montés → le formulaire de paiement restait payable sur l'ancien panier/
      // montant, avec un bandeau d'erreur périmé à côté. On masque donc le
      // formulaire (clientSecret/breakdown = null) tant qu'un nouveau devis valide
      // n'est pas obtenu, et on efface l'erreur périmée.
      setLoading(true);
      setError(null);
      setClientSecret(null);
      setBreakdown(null);
      try {
        // Pour le anti-tampering check, on doit envoyer un expectedSubtotal
        // proche du compute serveur. On loop tous les items + appelle
        // /api/products/[id] pour chacun (parallel pour la latence).
        const prices = await Promise.all(
          allItems.map(async (it) => {
            const res = await fetch(`/api/products/${it.productId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ optionIds: it.optionIds }),
            });
            const data = await res.json();
            return data.price ?? 0;
          }),
        );
        const expectedSubtotal = prices.reduce((sum, p) => sum + (typeof p === 'number' ? p : 0), 0);

        // Devis de livraison — périmètre de la sig. /api/shipping/estimate (étape
        // shipping) ne signe que le DERNIER produit (page mono-produit). En
        // multi-items, on ré-estime ici le panier COMPLET → prix correct (sinon
        // sous-facturation : un seul produit tarifé pour tout le panier) + sig
        // couvrant tous les productIds (sinon faux rejet de la vérif anti-tamper
        // server-side). Recalculé à chaque mutation du panier (dep allItemsKey),
        // donc cohérent même après un « Retirer » à review. Mono-produit : la sig
        // du shipping step couvre déjà tout → on la réutilise telle quelle.
        let effectiveShipPrice = ship.price;
        let effectiveShipSig = ship.sig;
        if (allItems.length > 1) {
          const estRes = await fetch('/api/shipping/estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: allItems.map((it) => ({
                productId: it.productId,
                options: Object.fromEntries(it.optionIds.map((id, i) => [`opt_${i}`, String(id)])),
              })),
              shippingInfo: { ShipState: ship.province, ShipZip: ship.postalCode, ShipCountry: 'CA' },
            }),
          });
          if (!estRes.ok) {
            throw new Error('Impossible de recalculer la livraison pour ce panier. Réessaie dans un instant.');
          }
          const estData = await estRes.json();
          const match = (estData.methods ?? []).find(
            (m: { method: string; price: number; sig: string }) => m.method === ship.method,
          );
          if (!match) {
            throw new Error(
              'La méthode de livraison choisie n’est plus disponible pour ce panier. Retourne à l’étape Livraison pour la re-sélectionner.',
            );
          }
          effectiveShipPrice = match.price;
          effectiveShipSig = match.sig;
        }

        const createRes = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: allItems.map((it, i) => ({
              productId: it.productId,
              optionIds: it.optionIds,
              files: it.files,
              internalRef: `PLIO-${Date.now()}-${i}`,
            })),
            contact: { firstName: ship.firstName, lastName: ship.lastName, email: ship.email, phone: ship.phone },
            shippingAddress: { line1: ship.line1, line2: ship.line2, city: ship.city, province: ship.province, postalCode: ship.postalCode },
            shippingMethod: ship.method,
            shippingPrice: effectiveShipPrice,
            // Round 1 audit — sig du devis de livraison (vérifiée server-side).
            // En multi-items = sig ré-émise pour le panier complet (ci-dessus).
            ...(effectiveShipSig ? { shippingQuoteSig: effectiveShipSig } : {}),
            // Round 26 #2 — instructions livraison customer (optional)
            ...(ship.note ? { shippingNote: ship.note } : {}),
            expectedSubtotal,
            notes: `Commande Plio ${new Date().toISOString()}`,
            idempotencyKey,
            ...(designId ? { designId } : {}),
            ...(appliedPromo ? { promoCode: appliedPromo } : {}),
          }),
        });

        if (!createRes.ok) {
          const data = await createRes.json();
          console.error('[orders/create] failed:', data);
          throw new Error((data.error || `HTTP ${createRes.status}`) + (data.details ? ` — ${JSON.stringify(data.details)}` : ''));
        }

        const data = await createRes.json();
        if (!cancelled) {
          setClientSecret(data.clientSecret);
          setBreakdown(data.breakdown);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // allItems dep : si user remove un item du cart pendant qu'il est sur
    // la page, on re-create un PaymentIntent avec le nouveau total.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, optionsParam, filesParam, ship, appliedPromo, designId, allItemsKey]);

  const stripe = getStripe();
  const prevHref = `/order/shipping?productId=${productId}&options=${optionsParam}&files=${filesParam}` as Route;

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>Plio.</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb">Récapitulatif & paiement</span>
        </div>
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuenow={6} aria-valuemin={1} aria-valuemax={6}>
            <div className="progress-segment done"></div><div className="progress-segment done"></div>
            <div className="progress-segment done"></div><div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
          </div>
          <div className="progress-label">Étape 06 sur 06 — Récapitulatif & paiement</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <ClientHeaderUserSlot hideWhenAnonymous />
        </div>
      </header>

      <main className="step-layout">
        {/* Round 40 #2 — padding via .step-content CSS so mobile @media wins */}
        <div className="step-content" style={{ maxWidth: 800 }}>
          <div className="step-eyebrow">Étape 06</div>
          <h1 className="step-question">Dernière <em>vérification.</em></h1>
          <p className="step-lede">
            On démarre la production dès que ton paiement est confirmé. Tracking par courriel sous 24h.
          </p>

          {ship && (
            <div className="panel" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: 28, marginBottom: 16, boxShadow: 'var(--shadow-xs)' }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span>Récap commande</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                  {allItems.length} article{allItems.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Items déjà dans le cart (ajoutés précédemment) */}
              {cart.items.map((it, i) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ width: 46, flexShrink: 0 }} aria-hidden>
                      {(() => { const m = mockupForProductName(it.productName); return <ProductMockup shape={m.shape} finish={m.finish} spec={specForProductName(it.productName)} seed={it.productName} height={30} />; })()}
                    </span>
                    <span><strong>Article {i + 1}</strong> · {it.productName} · {it.optionIds.length} options · {it.files.length} fichier(s)</span>
                  </span>
                  <button
                    onClick={() => cart.remove(it.id)}
                    title="Retirer cet article"
                    aria-label={`Retirer l'article ${i + 1}`}
                    style={{ background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', minHeight: 44, padding: '0 8px', display: 'inline-flex', alignItems: 'center' }}
                  >
                    Retirer
                  </button>
                </div>
              ))}

              {/* Item courant (URL params) — pas encore "ajouté" au cart */}
              {currentItem && (
                <div style={{ padding: '8px 0', borderBottom: cart.items.length > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ width: 46, flexShrink: 0 }} aria-hidden>
                      {(() => { const m = mockupForProductName(currentSnapshot?.productName); return <ProductMockup shape={m.shape} finish={m.finish} spec={specForProductName(currentSnapshot?.productName)} seed={currentSnapshot?.productName ?? undefined} height={30} />; })()}
                    </span>
                    <span>
                      <strong>{cart.items.length > 0 ? `Article ${cart.items.length + 1}` : 'Cet article'}</strong>{' '}
                      · {currentSnapshot?.productName ?? `Produit #${currentItem.productId}`} · {currentItem.optionIds.length} options · {currentItem.files.length} fichier(s)
                    </span>
                  </span>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <Row label="Destinataire" value={`${ship.firstName} ${ship.lastName}`} />
                <Row label="Adresse" value={`${ship.line1}, ${ship.city} ${ship.province} ${ship.postalCode}`} />
                <Row label="Livraison" value={`${ship.method} · ${(breakdown?.shipping ?? ship.price).toFixed(2)} $`} />
              </div>

              {/* "Ajouter un autre produit" — visible si pas full */}
              {!cart.isFull && (
                <button
                  onClick={handleAddAnother}
                  style={{
                    marginTop: 16,
                    width: '100%',
                    padding: '12px 16px',
                    background: 'transparent',
                    border: '1px dashed var(--accent-primary)',
                    borderRadius: 'var(--r-md)',
                    color: 'var(--accent-primary)',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  + Ajouter un autre produit à cette commande
                </button>
              )}
              {cart.isFull && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--warning-soft, #FFF6E5)', border: '1px solid var(--warning, #D97706)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--text-primary)' }}>
                  Maximum atteint. Pour de plus gros volumes, contacte-nous à <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a>.
                </div>
              )}
            </div>
          )}

          {breakdown && (
            <div style={{ background: 'linear-gradient(180deg, var(--bg-sunken) 0%, var(--accent-soft) 100%)', border: '1px solid var(--accent-soft)', borderRadius: 'var(--r-lg)', padding: 32, marginBottom: 24 }}>
              <Total label="Sous-total impression" value={breakdown.subtotal} />
              {breakdown.discount > 0 && (
                <Total
                  label={`Code promo ${breakdown.promoCode ?? ''}`}
                  value={-breakdown.discount}
                  highlight="discount"
                />
              )}
              {/* Round 30 #1 — reseller VERIFIED 5 % discount, ligne visible */}
              {breakdown.resellerDiscount && breakdown.resellerDiscount > 0 && (
                <Total
                  label={breakdown.resellerDiscountLabel ?? 'Reseller perks (-5 %)'}
                  value={-breakdown.resellerDiscount}
                  highlight="discount"
                />
              )}
              <Total label={`Livraison${ship ? ' (' + ship.method + ')' : ''}`} value={breakdown.shipping} />
              {breakdown.perks?.goldFreeShipping && (
                <div style={{
                  marginTop: 4,
                  marginBottom: 8,
                  padding: '8px 12px',
                  background: 'var(--accent-soft)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  color: 'var(--accent-primary)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <Icon name="award" size={16} aria-hidden />
                  <span>
                    Livraison <strong>offerte</strong> avec ton statut OR
                    {typeof breakdown.originalShipping === 'number' && breakdown.originalShipping > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                        (économie {breakdown.originalShipping.toFixed(2)} $)
                      </span>
                    )}
                  </span>
                </div>
              )}
              {breakdown.taxLines.map((t) => (
                <Total key={t.code} label={t.label} value={t.amount} />
              ))}
              {/* Round 30 #1 — wallet + referral credits visibles. Avant :
                  Stripe débitait moins que le total affiché → confusion. */}
              {breakdown.walletCredit && breakdown.walletCredit > 0 && (
                <Total
                  label="Crédit wallet"
                  value={-breakdown.walletCredit}
                  highlight="discount"
                />
              )}
              {breakdown.referralCredit && breakdown.referralCredit > 0 && (
                <Total
                  label="Crédit parrainage"
                  value={-breakdown.referralCredit}
                  highlight="discount"
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 16, marginTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Total à payer</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 400, color: 'var(--accent-primary)', letterSpacing: '-0.03em' }}>
                  {breakdown.total.toFixed(2)} $
                </span>
              </div>
            </div>
          )}

          {breakdown && (
            <PromoCodeField
              subtotalCents={Math.round(breakdown.subtotal * 100)}
              appliedPromo={appliedPromo}
              onApply={setAppliedPromo}
              onRemove={() => setAppliedPromo(null)}
            />
          )}
        </div>

        {/* Audit mobile — `recap-payment` : sur les AUTRES étapes le `.recap`
            (résumé) est masqué <1100px ; ici il contient le PAIEMENT, qui DOIT
            rester visible sur mobile (sinon checkout impossible). Override CSS
            ciblé dans globals.css (.recap.recap-payment). */}
        <aside className="recap recap-payment" style={{ padding: 0 }}>
          <div style={{ padding: 32, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)', margin: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.02em', fontWeight: 400, margin: 0 }}>Paiement</h2>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', color: 'var(--success)', fontWeight: 600 }}>
                <Icon name="lock" size={13} /> Stripe
              </span>
            </div>

            {loading && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>⏳ Initialisation du paiement…</div>}
            {error && (
              <div role="alert" aria-live="assertive" style={{ padding: 16, background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', color: 'var(--danger)', fontSize: 13 }}>
                <strong>Erreur :</strong> {error}
              </div>
            )}
            {clientSecret && breakdown && stripe && (
              <Elements
                // Audit v2 #1.1 — Stripe lie <Elements> à son clientSecret AU MONTAGE
                // (immuable côté SDK). Quand le panier/promo change, l'effet recrée le
                // PaymentIntent (nouveau clientSecret + nouveau breakdown.total) mais
                // sans `key`, <Elements> garde l'ANCIEN intent → confirmPayment()
                // débite l'ancien montant ≠ total affiché/consenti. key={clientSecret}
                // force le remount sur le nouvel intent (re-saisie carte = consentement
                // frais sur le bon montant, comportement voulu).
                key={clientSecret}
                stripe={stripe}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#1F3D2B',
                      colorBackground: '#FAFAF7',
                      colorText: '#141C16',
                      borderRadius: '12px',
                      fontFamily: 'Inter, system-ui, sans-serif',
                    },
                  },
                }}
              >
                <PaymentForm total={breakdown.total} />
              </Elements>
            )}
          </div>
          <div style={{ padding: '0 32px 32px', display: 'grid', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
            <div><Icon name="check" size={11} /> Production démarre sous 2h</div>
            <div><Icon name="check" size={11} /> Annulation possible avant production</div>
            <div><Icon name="check" size={11} /> Tracking par courriel sous 24h</div>
          </div>
        </aside>
      </main>

      <footer className="shell-footer">
        <div>
          <Link href={prevHref} className="btn btn-ghost">
            <span style={{ fontFamily: 'var(--font-mono)' }}>←</span> Précédent
          </Link>
        </div>
        <div className="shell-footer-center">↵ Entrée pour confirmer</div>
        <div className="shell-footer-right">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            PAIEMENT VIA STRIPE
          </span>
        </div>
      </footer>
    </div>
  );
}

function PaymentForm({ total }: { total: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(true);

  // FIABILITÉ (Round 1 audit) : returnUrl dérivé de window.location.origin
  // (composant client) et NON de process.env.NEXT_PUBLIC_APP_URL. Cette dernière
  // est inlinée au BUILD : si elle manquait au build Amplify, returnUrl retombait
  // sur http://localhost:3000 → Stripe redirigeait le client PAYÉ vers localhost
  // (client perdu, cart non vidé, zéro confirmation, échec silencieux).
  // window.location.origin est toujours l'origine réelle du visiteur.
  // (Le fallback SSR relatif n'est jamais envoyé à Stripe : confirmPayment ne
  // s'exécute que sur clic, côté client, où window existe.)
  const returnUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/order/confirmation`
      : '/order/confirmation';

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setStripeError(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    if (error) {
      setStripeError(error.message ?? 'Erreur de paiement');
      setSubmitting(false);
    }
    // Sur succès, Stripe redirige vers return_url avec ?payment_intent=… &payment_intent_client_secret=…
  };

  // ExpressCheckoutElement = bouton wallet (Apple Pay / Google Pay / Link)
  // au-dessus du PaymentElement classique. Conversion mobile +30 % typique
  // car le user n'a pas à saisir de carte. Stripe affiche automatiquement
  // les wallets supportés par le device + le browser (Safari → Apple Pay,
  // Chrome Android → Google Pay).
  const handleExpressConfirm = async () => {
    if (!stripe || !elements) return;
    if (!accepted) {
      setStripeError('Tu dois accepter les conditions générales avant de payer.');
      return;
    }
    setSubmitting(true);
    setStripeError(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    if (error) {
      setStripeError(error.message ?? 'Erreur de paiement');
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Wallet button (Apple Pay / Google Pay / Link). Stripe hide
          automatically si aucun wallet supporté par le device. */}
      <div style={{ marginBottom: 16 }}>
        <ExpressCheckoutElement
          onConfirm={handleExpressConfirm}
          options={{
            buttonHeight: 48,
            buttonTheme: { applePay: 'black', googlePay: 'black' },
            wallets: { applePay: 'always', googlePay: 'always' },
            layout: { maxColumns: 2, maxRows: 1 },
          }}
        />
        {/* Separator OR — visible que si le wallet element a quelque chose */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: '16px 0 12px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          <span>ou payer par carte</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        </div>
      </div>
      <PaymentElement />
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--accent-primary)' }}
        />
        <span>
          J&apos;accepte les <a href="/legal/terms" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>conditions générales</a> et la <a href="/legal/refund-policy" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>politique de remboursement</a>.
        </span>
      </label>
      {stripeError && (
        <div style={{ padding: 12, background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 'var(--r-md)', fontSize: 13, marginBottom: 12 }}>
          {stripeError}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={!stripe || !accepted || submitting}
        style={{
          width: '100%',
          height: 64,
          background: 'var(--accent-primary)',
          color: 'var(--text-on-accent)',
          borderRadius: 'var(--r-pill)',
          fontSize: 17,
          fontWeight: 600,
          boxShadow: 'var(--shadow-accent)',
          cursor: submitting ? 'wait' : !accepted ? 'not-allowed' : 'pointer',
          opacity: submitting || !accepted ? 0.6 : 1,
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        {submitting ? '⏳ Traitement…' : (
          <>
            Confirmer la commande
            <span style={{ fontFamily: 'var(--font-mono)' }}>{total.toFixed(2)} $</span>
          </>
        )}
      </button>

      {/* Round 45 #5 — réassurance au POINT exact de friction (sous le bouton
          payer). Chaque ligne répond à une peur réelle au checkout et est
          VRAIE : Stripe chiffre la carte (jamais sur nos serveurs), annulation
          possible avant production (cf. politique de remboursement), support
          humain réel. */}
      <ul
        aria-label="Garanties de paiement"
        style={{
          listStyle: 'none',
          margin: '16px 0 0',
          padding: 0,
          display: 'grid',
          gap: 8,
          fontSize: 12.5,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        <li><Icon name="lock" size={13} /> Paiement chiffré par Stripe — ta carte ne transite jamais par nos serveurs.</li>
        <li><Icon name="arrow-right" size={13} style={{transform:"scaleX(-1)"}} /> Annulation gratuite tant que la production n&apos;a pas démarré.</li>
        <li>
          <Icon name="mail" size={13} /> Une question ?{' '}
          <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>
            bonjour@plio.ca
          </a>{' '}
          — on répond vite.
        </li>
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Total({ label, value, highlight }: { label: string; value: number; highlight?: 'discount' }) {
  const color = highlight === 'discount' ? 'var(--success, #16a34a)' : 'var(--text-primary)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: highlight === 'discount' ? color : 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color, fontWeight: 500 }}>
        {value < 0 ? `−${Math.abs(value).toFixed(2)}` : value.toFixed(2)} $
      </span>
    </div>
  );
}

/**
 * Input pour entrer un code promo. Validate via POST /api/promo/validate
 * en debounce (sur Apply click), affiche le résultat. Si appliqué, le
 * parent re-compute le breakdown via re-call /api/orders/create.
 */
function PromoCodeField({
  subtotalCents,
  appliedPromo,
  onApply,
  onRemove,
}: {
  subtotalCents: number;
  appliedPromo: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleApply() {
    if (!input.trim()) return;
    setChecking(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: input.trim(), subtotalCents }),
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback({ ok: true, message: data.message });
        onApply(input.trim().toUpperCase());
      } else {
        setFeedback({ ok: false, message: data.message });
      }
    } catch {
      setFeedback({ ok: false, message: 'Erreur réseau, réessaie.' });
    } finally {
      setChecking(false);
    }
  }

  function handleRemove() {
    setInput('');
    setFeedback(null);
    onRemove();
  }

  if (appliedPromo) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--success-soft, #f0fdf4)', border: '1px solid var(--success, #16a34a)', borderRadius: 'var(--r-md)', marginBottom: 24, fontSize: 13 }}>
        <span>
          <strong style={{ color: 'var(--success, #16a34a)' }}><Icon name="check" size={13} /> {appliedPromo}</strong> appliqué
        </span>
        <button onClick={handleRemove} aria-label="Retirer le code promo" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', minHeight: 44, padding: '0 8px', display: 'inline-flex', alignItems: 'center' }}>
          Retirer
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <details style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: '8px 16px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
          + Ajouter un code promo
        </summary>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleApply(); } }}
            placeholder="Ex. BIENVENUE10"
            disabled={checking}
            autoComplete="off"
            style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 16, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}
          />
          <button
            onClick={() => void handleApply()}
            disabled={checking || !input.trim()}
            className="btn btn-secondary btn-sm"
            style={{ padding: '8px 14px', opacity: checking || !input.trim() ? 0.5 : 1 }}
          >
            {checking ? '…' : 'Appliquer'}
          </button>
        </div>
        {feedback && (
          <div style={{ marginTop: 8, fontSize: 12, color: feedback.ok ? 'var(--success, #16a34a)' : 'var(--danger)' }}>
            <Icon name={feedback.ok ? 'check' : 'x'} size={12} /> {feedback.message}
          </div>
        )}
      </details>
    </div>
  );
}
