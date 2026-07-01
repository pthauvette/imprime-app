/**
 * create_order Mode B — placement d'une commande headless (paiement par lien
 * Stripe). Orchestre les prérequis livrés séparément. Gardé derrière le flag
 * MCP_CREATE_ORDER_PAY (OFF par défaut) + le scope orders:write:headless (vérifié
 * par l'appelant). Crée un Order PENDING + une Checkout Session ; le webhook
 * payment_intent.succeeded finalise (place Sinalite) au paiement.
 *
 * Sécurité (revue adversariale) : prix RE-CALCULÉ serveur (jamais l'agent), port
 * RE-ESTIMÉ serveur, idempotence claim-avant-écriture (clé stable), contact.email
 * jamais utilisé comme customer Stripe (= email du COMPTE), plafond montant,
 * rate-limit fail-closed prod, fileUrl restreint au bucket S3 Plio.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { createReservedOrder, InsufficientCreditError } from '@/lib/orders/credit-reservation';
import { buildItemsSnapshot } from '@/lib/orders/items';
import { sinalite } from '@/lib/sinalite/client';
import { priceOrder, type ResellerStatus } from '@/lib/orders/price-order';
import { rateLimit, rateLimitEnabled } from '@/lib/ratelimit';
import type { CaProvince, ShipMethod } from '@/lib/sinalite/types';
import { logAuth } from '@/lib/logger';
import { resolveOrderItem } from './tools/create-order';
import { assertPlioFileUrl } from './file-url-guard';
import { reestimateShipping, selectShippingMethod } from './tools/shipping';
import {
  deriveIdempKey, claimMcpOrderIntent, attachOrderToIntent, completeMcpOrderIntent, releaseMcpOrderIntent,
} from './order-intent';
import { isHeadlessOrderEnabled, createMcpCheckoutSession } from './checkout-session';
import { buildMcpSinalitePayload } from './sinalite-payload';

/** Plafond dur d'une commande passée via IA (anti-clé fuitée / erreur d'agent). */
const MAX_TOTAL_CENTS = 500_000; // 5000 $

/** Anti régression SILENCIEUSE : on signale UNE seule fois par cold-start Lambda qu'un
 *  paiement headless tourne avec le préflight fichier affaibli (off/log). 1 seul thread
 *  JS par conteneur → pas de course ; reset à chaque cold-start (= ce qu'on veut). */
let warnedPreflightWeakened = false;

export interface HeadlessOrderArgs {
  items: { slug: string; paper: string; finish: string; quantity: number; fileUrl: string; internalRef?: string }[];
  contact: { firstName: string; lastName: string; email: string; phone: string };
  shippingAddress: { line1: string; line2?: string; city: string; province: CaProvince; postalCode: string };
  shippingMethod: ShipMethod;
  /** Total CAD AVANT crédits (gross), en cents. Garde-fou anti-tamper (le débit = recompute serveur). */
  expectedGrossCents: number;
  idempotencyKey: string;
  promoCode?: string;
  shippingNote?: string;
}

export type HeadlessOrderResult =
  | { ok: true; orderId: string; checkoutUrl: string; grossTotalCents: number; totalCents: number; walletAppliedCents: number; referralAppliedCents: number; shippingCents: number; replay: boolean }
  | { ok: false; message: string };

const err = (message: string): HeadlessOrderResult => ({ ok: false, message });
const cents = (dollars: number) => Math.round(dollars * 100);

/** Rend le résultat headless en texte pour l'agent (récap + lien de paiement). */
export function formatHeadlessResult(r: HeadlessOrderResult): string {
  if (!r.ok) return `❌ ${r.message}`;
  if (r.replay) {
    return `Commande déjà créée (idempotence). Lien de paiement : ${r.checkoutUrl}`;
  }
  const lines = [
    `Commande créée : ${r.orderId} — statut EN ATTENTE DE PAIEMENT.`,
    `Sous-total + port + taxes : ${(r.grossTotalCents / 100).toFixed(2)} $ CAD.`,
  ];
  if (r.walletAppliedCents > 0) lines.push(`Crédit portefeuille : −${(r.walletAppliedCents / 100).toFixed(2)} $`);
  if (r.referralAppliedCents > 0) lines.push(`Crédit parrainage : −${(r.referralAppliedCents / 100).toFixed(2)} $`);
  lines.push(
    `**À PAYER : ${(r.totalCents / 100).toFixed(2)} $ CAD**`,
    ``,
    `Lien de paiement sécurisé Stripe (expire dans 1 h) : ${r.checkoutUrl}`,
    `Une fois payée, la commande part en production et un courriel de confirmation est envoyé.`,
  );
  return lines.join('\n');
}

export async function placeHeadlessOrder(
  args: HeadlessOrderArgs,
  user: { userId: string },
  nowMs: number,
): Promise<HeadlessOrderResult> {
  if (!isHeadlessOrderEnabled()) {
    return err("Le paiement headless via IA n'est pas activé. Utilise create_order sans fileUrl pour obtenir un lien à finaliser sur plio.ca.");
  }

  // 1. Résoudre les items + valider chaque fileUrl (anti-SSRF, bucket Plio only).
  const resolved: { productId: number; optionIds: number[]; fileUrl: string; internalRef?: string }[] = [];
  const detailCache = new Map<number, Awaited<ReturnType<typeof sinalite.getProductDetail>>>();
  const productNames = new Map<number, string>();
  for (const it of args.items) {
    const file = assertPlioFileUrl(it.fileUrl);
    if (!file.ok) return err(`Fichier refusé (${it.slug}) : ${file.reason}`);
    const r = await resolveOrderItem(it);
    if (!r.ok) return err(`${it.slug} : ${r.message}`);
    resolved.push({ productId: r.productId, optionIds: r.optionIds, fileUrl: file.url, internalRef: it.internalRef });
    if (!detailCache.has(r.productId)) detailCache.set(r.productId, await sinalite.getProductDetail(r.productId));
    if (!productNames.has(r.productId)) productNames.set(r.productId, r.name);
  }
  const itemKeys = resolved.map((r) => ({ productId: r.productId, optionIds: r.optionIds }));

  // 2. Idempotence : claim AVANT le rate-limit (un retry ne consomme pas le bucket).
  const idempKey = deriveIdempKey({
    idempotencyKey: args.idempotencyKey, userId: user.userId, items: itemKeys,
    shippingMethod: args.shippingMethod, promoCode: args.promoCode ?? null,
  });
  const claim = await claimMcpOrderIntent(user.userId, idempKey);
  if (claim.status === 'completed') {
    return { ok: true, orderId: claim.orderId, checkoutUrl: claim.checkoutUrl ?? '', grossTotalCents: 0, totalCents: 0, walletAppliedCents: 0, referralAppliedCents: 0, shippingCents: 0, replay: true };
  }
  if (claim.status === 'pending') {
    return err('Une commande identique est déjà en cours de création. Réessaie dans un instant.');
  }

  // 3. Rate-limit fail-CLOSED en prod (mutation à coût Stripe), seulement pour une
  //    intention NEUVE. Sur rejet → on RELÂCHE le claim (pas d'Order créé encore).
  if (process.env.NODE_ENV === 'production' && !rateLimitEnabled) {
    await releaseMcpOrderIntent(user.userId, idempKey);
    return err('Service de commande momentanément indisponible (protection anti-abus non configurée).');
  }
  const rlUser = await rateLimit('mcpOrder', `user:${user.userId}`);
  if (!rlUser.ok) { await releaseMcpOrderIntent(user.userId, idempKey); return err('Trop de commandes en peu de temps. Réessaie plus tard.'); }
  const rlGlobal = await rateLimit('mcpOrderGlobal', 'all');
  if (!rlGlobal.ok) { await releaseMcpOrderIntent(user.userId, idempKey); return err('Service de commande saturé. Réessaie dans un instant.'); }

  // 3.b — PRÉFLIGHT FICHIER (backstop serveur money-critical). Read-only, AVANT toute
  //   création d'Order/Session Stripe → un fichier de CONTENU non conforme (PDF corrompu/
  //   chiffré/trop peu de pages) est refusé sans rien facturer. Placé APRÈS le rate-limit :
  //   le téléchargement (jusqu'à 150 Mo/fichier) est ainsi protégé contre une clé fuitée
  //   qui spammerait des fetchs. fail-OPEN infra (S3 KO) / fail-CLOSED contenu (PDF
  //   corrompu/chiffré/pages, ou trop gros pour être parsé) — hérité de
  //   revalidatePrintFiles (#1), une seule définition web↔Mode B.
  //
  //   KILL-SWITCH `MCP_FILE_PREFLIGHT`, DÉFAUT = enforce (fail-closed sur l'oubli de
  //   config : oublier la var en activant Mode B → on valide quand même). Seul un
  //   `off` EXPLICITE désactive (urgence : faux-positif du validateur), sans couper
  //   tout Mode B. `log` = tourne + journalise sans bloquer (1re activation prudente).
  //   Import DYNAMIQUE : ne pas tirer pdf-lib au cold-start Lambda. TOUJOURS await.
  const preflightMode = (process.env.MCP_FILE_PREFLIGHT ?? '').trim().toLowerCase();
  // Dérogation = backstop intentionnellement absent (off) ou passif (log) ALORS que Mode B
  // est actif (on a passé la garde isHeadlessOrderEnabled). État de régression silencieuse
  // → on le rend visible UNE fois par cold-start (CloudWatch), avec rappel de re-basculer.
  if ((preflightMode === 'off' || preflightMode === 'log') && !warnedPreflightWeakened) {
    warnedPreflightWeakened = true;
    logAuth.warn(
      { mode: preflightMode },
      'mcp: ⚠️ paiement headless ACTIF avec préflight fichier affaibli (dérogation) — repasser en enforce dès que possible',
    );
  }
  if (preflightMode !== 'off') {
    const { revalidatePrintFiles } = await import('@/lib/orders/revalidate-files');
    let fileOutcomes: Awaited<ReturnType<typeof revalidatePrintFiles>>;
    try {
      // Chaque item Mode B = EXACTEMENT 1 fichier → l'ordre de fileOutcomes suit `resolved`
      // (flatMap + Promise.all préservent l'ordre) → corrélation par INDEX, jamais par URL
      // (deux items peuvent partager le même fileUrl). Le slug est re-dérivé du productId
      // côté helper (dimensions = warning non bloquant, seul le contenu PDF bloque).
      fileOutcomes = await revalidatePrintFiles(
        resolved.map((r) => ({ productId: r.productId, files: [{ url: r.fileUrl }] })),
      );
    } catch (e) {
      // revalidatePrintFiles ne devrait jamais throw (fetch catché en interne) ; si ça
      // arrive, fail-OPEN — ne JAMAIS bloquer un paiement sur une panne du validateur.
      logAuth.warn({ userId: user.userId, err: String(e) }, 'mcp: préflight fichier — erreur inattendue, fail-open');
      fileOutcomes = [];
    }
    const badSlugs = fileOutcomes
      .map((o, i) => (o.blocking ? args.items[i]?.slug ?? `article ${i + 1}` : null))
      .filter((s): s is string => s !== null);
    if (badSlugs.length) {
      logAuth.warn(
        {
          userId: user.userId,
          mode: preflightMode || 'enforce',
          blockers: badSlugs.length,
          codes: fileOutcomes.filter((o) => o.blocking).flatMap((o) => o.issues.map((i) => i.code)),
        },
        `mcp: préflight fichier — fichier(s) non conforme(s)${preflightMode === 'log' ? ' (log, non bloqué)' : ', commande refusée'}`,
      );
      if (preflightMode !== 'log') {
        // ENFORCE (défaut) : on RELÂCHE le claim — aucun Order créé à ce stade (préflight
        // avant createPendingOrder), un retry du même achat doit pouvoir repartir.
        // Identique au pattern rate-limit ci-dessus.
        await releaseMcpOrderIntent(user.userId, idempKey);
        return err(
          `Fichier non conforme (${badSlugs.join(', ')}) : corrige le PDF avant de commander ` +
          `(vérifie-le avec validate_print_file). Aucun montant n'a été débité.`,
        );
      }
      // 'log' : on a journalisé, on NE bloque PAS → la commande continue.
    }
  }

  // À partir d'ici, sur erreur on NE relâche PAS le claim (un Order a pu être créé) ;
  // un retry verra 'pending' et l'humain/cron gérera (cf. durcissement webhook).
  try {
    // 4. Ré-estimer le port côté SERVEUR (jamais le prix de l'agent).
    const ship = await reestimateShipping(itemKeys, args.shippingAddress.province, args.shippingAddress.postalCode);
    const method = selectShippingMethod(ship, args.shippingMethod);
    if (!method) return err(`Méthode de livraison « ${args.shippingMethod} » indisponible pour cette destination. Relance estimate_shipping.`);

    // 5. Compte (email + prefs) + nombre de commandes honorées (firstOrderOnly par userId).
    const account = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { email: true, loyaltyTier: true, referralCreditCents: true, walletCents: true, taxExempt: true, resellerStatus: true },
    });
    if (!account?.email) return err('Compte introuvable ou sans courriel.');
    const orderCountForUser = await prisma.order.count({
      where: { userId: user.userId, status: { notIn: ['PENDING', 'FAILED', 'CANCELLED'] } },
    });

    // 6. Prix RE-CALCULÉ serveur (port = prix serveur de la méthode choisie).
    const priced = await priceOrder({
      items: itemKeys,
      province: args.shippingAddress.province,
      postalCode: args.shippingAddress.postalCode,
      shippingMethod: args.shippingMethod,
      shippingPrice: method.price,
      enforceShippingSig: false, // on a ré-estimé → le sig n'est pas la frontière
      promoCode: args.promoCode ?? null,
      contactEmail: account.email,
      itemCount: resolved.length,
      user: {
        loyaltyTier: account.loyaltyTier,
        resellerStatus: (account.resellerStatus as ResellerStatus) ?? 'NONE',
        walletCents: account.walletCents,
        referralCreditCents: account.referralCreditCents,
        taxExempt: account.taxExempt,
      },
      orderCountForUser,
    });
    if (!priced.ok) return err(priced.message);

    // 7. Garde-fou montant : l'agent fournit le GROSS attendu (calculable sans connaître
    //    wallet/referral). Le DÉBIT reste le recompute serveur (totalCents).
    if (Math.abs(priced.grossTotalCents - args.expectedGrossCents) > 5) {
      return err(`Le prix a changé depuis ton devis (attendu ${(args.expectedGrossCents / 100).toFixed(2)} $, recalculé ${(priced.grossTotalCents / 100).toFixed(2)} $). Recommence le devis.`);
    }
    if (priced.totalCents > MAX_TOTAL_CENTS) {
      return err('Montant trop élevé pour une commande automatisée. Contacte Plio pour les gros volumes.');
    }
    if (priced.totalCents < 50) {
      return err('Montant trop faible pour un paiement Stripe.');
    }

    // 8. Payload Sinalite + snapshot d'affichage.
    const sinalitePayload = buildMcpSinalitePayload({
      items: resolved, detailCache, contact: args.contact,
      shippingAddress: args.shippingAddress, shippingMethod: args.shippingMethod, shippingNote: args.shippingNote,
    });
    const itemsSnapshot = buildItemsSnapshot(sinalitePayload, detailCache, productNames);

    // 9. Order PENDING + RÉSERVATION atomique des crédits (M2/M3). paymentIntentId
    //    placeholder unique (le webhook le patche au vrai pi_). Si un checkout concurrent
    //    a épuisé le solde → InsufficientCreditError → on RELÂCHE le claim (aucun Order
    //    créé, tx rollback) et on renvoie une err « recharge » (FORK 1).
    let order;
    try {
      ({ order } = await createReservedOrder({
      userId: user.userId,
      paymentIntentId: `mcp_${randomUUID()}`,
      amountCents: priced.totalCents,
      itemsCount: resolved.length,
      subtotalCents: cents(priced.subtotal),
      shippingCents: cents(priced.effectiveShippingPrice),
      taxCents: cents(priced.tax.total),
      discountCents: cents(priced.discountAmount),
      resellerDiscountCents: cents(priced.resellerDiscountAmount),
      referralCreditAppliedCents: priced.referralCreditApplied,
      walletCreditAppliedCents: priced.walletCreditApplied,
      promoCodeId: priced.promoRecord?.id,
      shippingMethod: args.shippingMethod,
      province: args.shippingAddress.province,
      shipName: `${args.contact.firstName} ${args.contact.lastName}`,
      shipLine1: args.shippingAddress.line1,
      shipLine2: args.shippingAddress.line2,
      shipCity: args.shippingAddress.city,
      shipProvince: args.shippingAddress.province,
      shipPostalCode: args.shippingAddress.postalCode,
      shipPhone: args.contact.phone,
      shippingNote: args.shippingNote ?? null,
      sinalitePayload,
      productSummary: priced.productSummary,
      itemsSnapshot,
      }));
    } catch (e) {
      if (e instanceof InsufficientCreditError) {
        await releaseMcpOrderIntent(user.userId, idempKey);
        return err('Ton solde de crédit a changé depuis ton devis (utilisé sur une autre commande). Recommence pour recalculer le total.');
      }
      throw e; // → catch principal (log + err générique)
    }

    // 10. Attache l'orderId au claim AVANT la Session (reprise sur crash).
    await attachOrderToIntent(user.userId, idempKey, order.id);

    // 11. Checkout Session (customer = email du COMPTE, jamais contact.email).
    const session = await createMcpCheckoutSession({
      orderId: order.id, amountCents: priced.totalCents, currency: 'cad',
      customerEmail: account.email, productSummary: priced.productSummary ?? 'Commande Plio',
      idempKey, nowMs,
    });

    // 12. Complète l'idempotence (replay → renvoie ce résultat sans 2e commande).
    await completeMcpOrderIntent(user.userId, idempKey, order.id, session.url);

    return {
      ok: true, orderId: order.id, checkoutUrl: session.url,
      grossTotalCents: priced.grossTotalCents, totalCents: priced.totalCents,
      walletAppliedCents: priced.walletCreditApplied, referralAppliedCents: priced.referralCreditApplied,
      shippingCents: cents(priced.effectiveShippingPrice), replay: false,
    };
  } catch (e) {
    logAuth.error({ err: String(e), userId: user.userId }, 'mcp: placeHeadlessOrder failed after claim');
    return err('Erreur lors de la création de la commande. Si le problème persiste, réessaie dans quelques minutes.');
  }
}
