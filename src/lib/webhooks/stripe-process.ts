/**
 * Logique business du webhook Stripe — extraite de la route handler pour
 * pouvoir être appelée à la fois par :
 *   - POST /api/webhooks/stripe (flow normal, après signature + dedup)
 *   - POST /api/admin/webhooks/[id]/replay (replay manuel par admin)
 *
 * Next.js 16 App Router interdit les named exports custom dans route.ts —
 * d'où le fichier séparé en /lib. La route ne fait plus que signature
 * verification + dedup + appel à `processStripeEvent`.
 *
 * Side-effects :
 *   - markOrderPaid/Submitted/Failed
 *   - sinalite.createOrder (POST externe)
 *   - stripe.refunds.create (POST externe)
 *   - sendOrderConfirmationEmail, sendOrderCancelledEmail, sendRefundIssuedEmail
 *   - sendCriticalAlert (Slack)
 *   - awardReferralCreditIfEligible (best-effort)
 */

import Stripe from 'stripe';
import { sinalite } from '@/lib/sinalite/client';
import { SinaliteOrderRequest } from '@/lib/sinalite/types';
import { enrichirPayloadSoumis, referencePlio } from '@/lib/sinalite/order-notes';
import { aucuneCreationPossible } from '@/lib/sinalite/submit-outcome';
import { PEREMPTION_VERROU_MS } from '@/lib/orders/replay-lock';
import { prisma } from '@/lib/db';
import {
  markOrderPaid,
  markOrderPaidWithWalletDebit,
  markOrderSubmitted,
  markOrderFailed,
  markRefundIssued,
  OrderNotFoundError,
} from '@/lib/db/orders';
import {
  sendOrderConfirmationEmail,
  sendOrderCancelledEmail,
  sendPaymentFailedEmail,
  sendRefundIssuedEmail,
} from '@/lib/emails/send';
import { logStripe } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import { getStripe } from '@/lib/stripe/client';

/**
 * Process a Stripe event (post-signature, post-dedup). Caller handles
 * outcome recording and HTTP response. This function routes by event type
 * and propagates errors.
 */
export async function processStripeEvent(
  event: Stripe.Event,
  ctx: { orderId?: string },
): Promise<void> {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent, ctx);
      break;
    }
    case 'payment_intent.payment_failed': {
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent, ctx);
      break;
    }
    case 'checkout.session.completed': {
      // Round 18 #1 — wallet topup via Stripe Checkout. Distinct des
      // payment_intent.succeeded car le wizard d'order utilise Payment
      // Intents direct alors que le topup utilise Checkout Sessions
      // (meilleur UX pour un montant variable + bonus visible).
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === 'wallet_topup') {
        // Round 22 #3 — subscription mode → store the sub ID on User
        // pour permettre cancel later. Le invoice.paid premier viendra
        // séparément et fera le crédit.
        if (session.mode === 'subscription' && session.subscription) {
          await handleWalletSubscriptionCreated(session);
        } else {
          // Mode 'payment' = one-shot topup, credit immediately
          await handleWalletTopup(session);
        }
      } else {
        logStripe.info({ sessionId: session.id, metadata: session.metadata }, 'checkout.session.completed without wallet_topup metadata — ignored');
      }
      break;
    }
    case 'checkout.session.expired': {
      // Durcissement Mode B #3b — une Checkout Session de commande headless expire
      // après 60 min sans paiement → l'Order resterait PENDING orphelin avec un
      // lien mort. On l'annule (atomique, seulement si encore PENDING).
      await handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
      break;
    }
    case 'invoice.paid': {
      // Round 22 #3 — recurring wallet topup. Stripe envoie invoice.paid
      // chaque mois quand la subscription est chargée.
      //
      // Audit-vérif H1 — BUG CORRIGÉ : avant, on testait `invoice.metadata?.kind`.
      // Or Stripe ne RECOPIE PAS `subscription_data.metadata` sur les
      // `invoice.metadata` des factures récurrentes (la metadata vit sur l'objet
      // Subscription). `invoice.metadata.kind` était donc TOUJOURS undefined →
      // la condition était toujours fausse → le wallet n'était JAMAIS crédité,
      // même à la 1re facture : le client était débité chaque mois pour rien.
      // On récupère désormais la metadata depuis la Subscription elle-même.
      const invoice = event.data.object as Stripe.Invoice;
      const subId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;
      if (!subId) break; // facture hors-abonnement → rien à faire ici
      const sub = await getStripe().subscriptions.retrieve(subId);
      if (sub.metadata?.kind === 'wallet_topup') {
        await handleWalletRecurringInvoice(invoice, sub.metadata);
      } else {
        // Subscription qui n'est PAS un wallet topup (defensive). Log et ignore.
        logStripe.info({ invoiceId: invoice.id, subId }, 'invoice.paid pour sub non-wallet — ignored');
      }
      break;
    }
    case 'customer.subscription.deleted': {
      // Round 22 #3 — user a cancel (ou expiration after cancel_at_period_end).
      // Nullify les fields wallet auto-renew côté DB.
      const sub = event.data.object as Stripe.Subscription;
      await handleWalletSubscriptionDeleted(sub);
      break;
    }
    default:
      logStripe.info({ eventType: event.type }, 'unhandled event');
  }
}

async function handleWalletSubscriptionCreated(session: Stripe.Checkout.Session): Promise<void> {
  const { prisma } = await import('@/lib/db');
  const meta = session.metadata ?? {};
  const userId = meta.userId;
  const amountCents = parseInt(meta.amountCents ?? '0', 10);
  const subId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;

  if (!userId || !subId || !amountCents) {
    throw new Error(`subscription session missing userId/subId/amountCents: ${JSON.stringify(meta)}`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      walletAutoRenewStripeSubId: subId,
      walletAutoRenewAmountCents: amountCents,
    },
  });
  logStripe.info({ userId, subId, amountCents }, 'wallet auto-renew subscription created');
  // Note : le invoice.paid premier viendra séparément (Stripe charge la
  // 1ère période immédiatement). On ne crédite pas ici pour éviter double-credit.
}

async function handleWalletRecurringInvoice(
  invoice: Stripe.Invoice,
  meta: Stripe.Metadata,
): Promise<void> {
  const { processWalletTopup } = await import('@/lib/wallet/operations');
  const userId = meta.userId;
  const amountCents = parseInt(meta.amountCents ?? '0', 10);
  const bonusCents = parseInt(meta.bonusCents ?? '0', 10);
  const tierLabel = meta.tierLabel || null;

  if (!userId || !amountCents) {
    throw new Error(`subscription metadata invalide pour invoice.paid : ${JSON.stringify(meta)}`);
  }

  // Idempotence : le invoice ID est unique Stripe-side, on l'utilise comme
  // paymentIntentId pour le WalletTransaction (le user a payé via cette invoice).
  const paymentIntentId = typeof invoice.payment_intent === 'string'
    ? invoice.payment_intent
    : invoice.payment_intent?.id ?? invoice.id;

  const result = await processWalletTopup({
    userId, amountCents, bonusCents, tierLabel,
    paymentIntentId,
  });
  logStripe.info({
    userId, amountCents, bonusCents,
    invoiceId: invoice.id,
    newBalance: result.balanceAfterCents,
  }, 'wallet recurring topup processed');
}

async function handleWalletSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const { prisma } = await import('@/lib/db');
  // Find user qui avait cette sub ID. Si déjà nullified (admin delete
  // route a déjà run), no-op.
  const user = await prisma.user.findFirst({
    where: { walletAutoRenewStripeSubId: sub.id },
    select: { id: true },
  });
  if (!user) {
    logStripe.info({ subId: sub.id }, 'subscription.deleted pour sub non-trackée — ignored');
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      walletAutoRenewStripeSubId: null,
      walletAutoRenewAmountCents: null,
    },
  });
  logStripe.info({ userId: user.id, subId: sub.id }, 'wallet auto-renew subscription deleted');
}

async function handleWalletTopup(session: Stripe.Checkout.Session): Promise<void> {
  const { processWalletTopup } = await import('@/lib/wallet/operations');
  const meta = session.metadata ?? {};
  const userId = meta.userId;
  const amountCents = parseInt(meta.amountCents ?? '0', 10);
  const bonusCents = parseInt(meta.bonusCents ?? '0', 10);
  const tierLabel = meta.tierLabel || null;
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? session.id;

  if (!userId || !amountCents) {
    throw new Error(`wallet_topup webhook missing userId or amountCents in metadata: ${JSON.stringify(meta)}`);
  }

  const result = await processWalletTopup({
    userId, amountCents, bonusCents, tierLabel,
    paymentIntentId,
  });
  logStripe.info({
    userId, amountCents, bonusCents,
    totalCredit: result.totalCreditCents,
    newBalance: result.balanceAfterCents,
  }, 'wallet topup processed');
}

/**
 * Mode B #3b — Checkout Session headless expirée (60 min sans paiement). On annule
 * l'Order PENDING orphelin (transition ATOMIQUE PENDING→CANCELLED : si payée entre
 * temps — course expired vs payment_intent.succeeded — count=0, on ne touche rien)
 * et on libère le claim d'idempotence (success=true au lien mort) pour qu'un
 * nouvel essai du même achat recrée une commande/session fraîche.
 */
async function handleCheckoutSessionExpired(session: Stripe.Checkout.Session): Promise<void> {
  // Seules les sessions de commande MCP Mode B ont un Order à annuler.
  const orderId = session.metadata?.orderId;
  if (session.metadata?.kind !== 'mcp-order' || !orderId) return;

  // M2/M3 — releaseReservedCreditsOnCancel fait la transition PENDING→CANCELLED
  //   ATOMIQUE (count===1) ET restaure les crédits wallet/referral réservés au create.
  const { releaseReservedCreditsOnCancel } = await import('@/lib/orders/credit-reservation');
  const rel = await releaseReservedCreditsOnCancel({ orderId, reason: 'checkout.session.expired' });
  if (!rel.released) {
    logStripe.info({ orderId, sessionId: session.id }, 'checkout.session.expired mais Order plus PENDING (payée ?) — ignoré');
    return;
  }
  await prisma.orderEvent.create({ data: { orderId, kind: 'CHECKOUT_EXPIRED' } });
  await prisma.mcpOrderIntent.deleteMany({ where: { orderId } });
  logStripe.info({ orderId, sessionId: session.id }, 'Mode B checkout session expirée — Order annulée + claim idempotence libéré');
}

async function handlePaymentSucceeded(
  intent: Stripe.PaymentIntent,
  ctx: { orderId?: string },
): Promise<void> {
  let order = await prisma.order.findUnique({
    where: { paymentIntentId: intent.id },
  });

  // Round 25 #5 — payment retry fallback. Si l'Order a été créée avec
  // un PI précédent qui a failed, le user a cliqué sur le retry link
  // → un nouveau PI a été créé avec metadata.orderId. On retrouve l'Order
  // par cet ID et on patch le paymentIntentId pour que les futurs events
  // (refund, etc) matchent. Idempotent : si on est déjà mis à jour
  // (replay du webhook), le lookup par paymentIntentId au-dessus aurait
  // succeed sans hitter ce fallback.
  if (!order && intent.metadata?.orderId) {
    const candidate = await prisma.order.findUnique({
      where: { id: intent.metadata.orderId },
    });
    // ⚠️ COMMANDE ENCAISSÉE DONT L'ISSUE DE PRODUCTION EST INCONNUE.
    //
    // La page `/payment/retry` refuse désormais d'ouvrir une session sur cet
    // état, mais le client a pu en ouvrir une AVANT que le marqueur soit posé
    // — les deux gestes tiennent dans les mêmes secondes. Ici, l'argent est
    // déjà arrivé : le seul rattrapage est de le rendre, pas d'adopter le
    // nouveau PaymentIntent.
    //
    // Adopter reviendrait à écraser `paymentIntentId`, donc à ORPHELINER le
    // premier encaissement — celui qu'on n'a justement pas remboursé. Tous les
    // gardes en aval (`charges.list({ payment_intent: order.paymentIntentId })`
    // dans le rejeu, le remboursement admin) interrogeraient le mauvais
    // paiement, et un remboursement « complet » laisserait le premier débit
    // intact et introuvable.
    //
    // Même filet que la branche CANCELLED ci-dessous : remboursement idempotent
    // du charge en trop, et on NE finalise PAS.
    if (candidate && candidate.sinaliteSubmitUncertainAt) {
      logStripe.error(
        { orderId: candidate.id, intentId: intent.id, receivedCents: intent.amount_received },
        'payment-retry: commande à issue de soumission INCONNUE — refus d’adopter le nouveau PI, refund du charge en double',
      );
      try {
        await getStripe().refunds.create(
          { payment_intent: intent.id, reason: 'duplicate', metadata: { orderId: candidate.id, reason: 'submit_uncertain_double_charge' } },
          { idempotencyKey: `uncertain_dup_${intent.id}` },
        );
      } catch (err) {
        logStripe.fatal(
          { err, orderId: candidate.id, intentId: intent.id },
          'CRITICAL: refund du charge en double impossible sur commande à issue inconnue',
        );
        await sendCriticalAlert({
          severity: 'critical',
          title: 'DOUBLE DÉBIT sur une commande à issue de soumission inconnue',
          body:
            `Commande ${candidate.id} (${referencePlio(candidate.id)}) — le client a payé une SECONDE ` +
            `fois (PI ${intent.id}) une commande déjà encaissée dont la production est incertaine, et ` +
            'le remboursement automatique a échoué. Rembourse ce PI à la main dans Stripe. ' +
            'Ne touche PAS au premier paiement tant que la vérification au portail n’est pas faite.',
          context: { orderId: candidate.id, paymentIntentId: intent.id },
          actionUrl: `/admin/orders/${candidate.id}`,
          actionLabel: 'Voir la commande',
        });
        // Audit 2026-07 #2 — THROW plutôt que return : sans ça, l'event est
        // marqué traité et la ligne dead-letter disparaît.
        throw err;
      }
      await sendCriticalAlert({
        severity: 'warning',
        title: 'Double paiement remboursé — commande à issue de soumission inconnue',
        body:
          `Commande ${candidate.id} (${referencePlio(candidate.id)}) — le client a repayé une commande ` +
          'déjà encaissée dont la production est incertaine. Le second débit a été remboursé ' +
          'automatiquement. La vérification au portail reste à faire.',
        context: { orderId: candidate.id, paymentIntentId: intent.id },
        actionUrl: `/admin/orders/${candidate.id}`,
        actionLabel: 'Voir la commande',
      });
      return;
    }
    if (candidate && (candidate.status === 'PENDING' || candidate.status === 'FAILED')) {
      // Patch le PI reference pour que markOrderPaid() ci-dessous puisse
      // match. Note : markOrderPaid lookups par paymentIntentId.
      order = await prisma.order.update({
        where: { id: candidate.id },
        data: {
          paymentIntentId: intent.id,
          // Reset status à PENDING si on retry depuis FAILED, pour que
          // le check status !== 'PENDING' ci-dessous ne bloque pas.
          ...(candidate.status === 'FAILED' && { status: 'PENDING' }),
        },
      });
      logStripe.info(
        { orderId: order.id, oldStatus: candidate.status, newIntentId: intent.id },
        'payment-retry: matched Order via intent.metadata.orderId fallback',
      );
    } else if (candidate && candidate.status === 'CANCELLED') {
      // FAILLE D (M2/M3) — COURSE : l'Order a été ANNULÉE (cron de libération des crédits
      //   réservés) entre l'ouverture de la session de retry et son paiement. Le client vient
      //   d'être débité pour une commande qui n'existe plus → charge-SANS-commande. Filet :
      //   REMBOURSER automatiquement (idempotent). Le crédit réservé a déjà été restauré par le
      //   cron → le client est rendu entier (refund Stripe + crédit déjà rendu).
      logStripe.error(
        { orderId: candidate.id, intentId: intent.id, receivedCents: intent.amount_received },
        'payment-retry: Order ANNULÉE avant paiement — refund automatique du charge orphelin',
      );
      try {
        await getStripe().refunds.create(
          { payment_intent: intent.id, reason: 'requested_by_customer', metadata: { orderId: candidate.id, reason: 'order-cancelled-before-payment' } },
          { idempotencyKey: `orphan_${intent.id}` },
        );
      } catch (err) {
        await sendCriticalAlert({
          severity: 'critical',
          title: 'Charge orphelin non remboursé (Order annulée avant paiement)',
          body: `PI ${intent.id} payé sur l'Order ${candidate.id} déjà ANNULÉE — le refund automatique a échoué. Rembourser à la main.`,
          context: { intentId: intent.id, orderId: candidate.id, err: String(err) },
        });
        // Audit 2026-07 #2 — THROW (pas return) : les deux autres chemins de refund du
        // fichier (garde montant l.~354, Sinalite-fail l.~536) THROW pour forcer un rejeu
        // Stripe. Ici, un `return` marquait l'event 200 → Stripe ne retentait JAMAIS →
        // course cancel/retry + panne API refund = client débité sans rattrapage auto.
        // On aligne : rejeu Stripe (l'idempotencyKey `orphan_${intent.id}` empêche tout
        // double-remboursement lors du retry).
        throw err;
      }
      return; // order reste null → aucune finalisation
    } else if (candidate) {
      // Audit 2026-07 #1 (HIGH, money-path) — DOUBLE-CHARGE sur retry de paiement.
      //   `candidate` existe mais n'est NI PENDING/FAILED (finalisation) NI CANCELLED
      //   (FAILLE D) → il est donc déjà payé (PAID/SUBMITTED/IN_PRODUCTION/SHIPPED/
      //   DELIVERED) par un AUTRE PaymentIntent : le lookup par paymentIntentId en tête a
      //   échoué, donc CE PI n'est pas celui enregistré sur l'Order. Un 2e paiement du
      //   même lien de retry a été encaissé en trop → charge en double. Sans ce garde, on
      //   tombait dans `if (!order) return` plus bas : charge retenu, jamais remboursé,
      //   sans alerte. On REMBOURSE automatiquement (idempotent, `reason: 'duplicate'`),
      //   symétrique à FAILLE D. La commande déjà finalisée reste intacte (un seul PI
      //   enregistré, une seule production Sinalite — l'invariant anti-double-production
      //   tient). L'idempotencyKey sur le retry (page.tsx) rend ce chemin rarissime ; il
      //   reste le filet de défense en profondeur si une course échappe à l'idempotence.
      logStripe.error(
        { orderId: candidate.id, intentId: intent.id, status: candidate.status, receivedCents: intent.amount_received },
        'payment-retry: DOUBLE-CHARGE (Order déjà payée par un autre PI) — refund automatique du charge en double',
      );
      try {
        await getStripe().refunds.create(
          { payment_intent: intent.id, reason: 'duplicate', metadata: { orderId: candidate.id, reason: 'duplicate-charge-order-already-paid' } },
          { idempotencyKey: `dup_${intent.id}` },
        );
      } catch (err) {
        await sendCriticalAlert({
          severity: 'critical',
          title: 'Charge en double non remboursé (Order déjà payée)',
          body: `PI ${intent.id} encaissé en double sur l'Order ${candidate.id} déjà payée (statut ${candidate.status}) — le refund automatique a échoué. Rembourser à la main.`,
          context: { intentId: intent.id, orderId: candidate.id, status: candidate.status, err: String(err) },
        });
        throw err; // idempotencyKey `dup_${intent.id}` empêche le double-remboursement au rejeu Stripe
      }
      return; // order reste null → aucune finalisation (l'autre PI a déjà finalisé)
    }
  }

  if (!order) {
    logStripe.error({ intentId: intent.id }, 'no Order for paymentIntent');
    return;
  }
  ctx.orderId = order.id;

  if (order.status !== 'PENDING') {
    logStripe.info({ orderId: order.id, status: order.status }, 'order already past PENDING');
    return;
  }

  // Revue Mode B (C1) — INVARIANT SÉCURITÉ : le montant RÉELLEMENT encaissé par
  // Stripe DOIT égaler le montant dû de l'Order. Sans ça, le fallback
  // metadata.orderId (ci-dessus) finaliserait un Order CHER avec un PaymentIntent
  // MOINS CHER (substitution cross-order : on livre/débite sur order.amountCents en
  // n'ayant encaissé que amount_received). Tous les flux légitimes matchent par
  // construction — web (PI créé à totalCents=amountCents), retry + Mode B (Checkout
  // Session unit_amount=amountCents) — donc zéro faux positif. Un écart = anomalie
  // ou abus → on NE finalise PAS (l'Order reste PENDING). On THROW : Stripe retente
  // (visible) et l'event n'est pas marqué traité ; un opérateur investigue.
  if (intent.amount_received !== order.amountCents) {
    logStripe.error(
      { orderId: order.id, owedCents: order.amountCents, receivedCents: intent.amount_received, intentId: intent.id },
      'SECURITY: Stripe amount_received != order.amountCents — refus de finaliser',
    );
    await sendCriticalAlert({
      severity: 'critical',
      title: 'Webhook : montant Stripe ≠ montant commande — finalisation refusée',
      body: `Un paiement encaissé ne correspond PAS au montant dû de la commande. Commande laissée en PENDING. Vérifie une éventuelle substitution cross-order (metadata.orderId) ou un bug de pricing.`,
      context: {
        orderId: order.id,
        owedCents: order.amountCents,
        receivedCents: intent.amount_received ?? null,
        paymentIntentId: intent.id,
      },
      actionUrl: `/admin/orders/${order.id}`,
      actionLabel: 'Voir la commande',
    });
    throw new Error(`amount mismatch on order ${order.id}: owed ${order.amountCents}, received ${intent.amount_received}`);
  }

  // Round 36 #1 — wallet debit + mark paid maintenant DANS LA MÊME
  // $transaction. Avant : 2 transactions séparées → si le process crashait
  // entre les 2, l'order était PAID mais wallet pas débité = customer
  // paie Stripe ET garde son crédit (split-brain ledger).
  //
  // Maintenant : si le wallet debit échoue, le mark-paid rollback aussi.
  // Le webhook Stripe retry et tout repart d'un état cohérent.
  // L'idempotency reste assurée par le check order.status !== 'PENDING'
  // ci-dessus : si on a déjà fait le tour avec succès, on early-return.
  const { transitioned } = await markOrderPaidWithWalletDebit({
    paymentIntentId: intent.id,
    walletDebit: order.walletCreditAppliedCents > 0
      ? {
          userId: order.userId,
          amountCents: order.walletCreditAppliedCents,
          description: `Order #${order.sinaliteOrderId ?? order.id.slice(-6)} — wallet applied`,
        }
      : undefined,
  });

  // Durcissement Mode B #3a — le check order.status !== 'PENDING' (l.~266) est un
  // READ non-atomique : DEUX events payment_intent.succeeded concurrents peuvent
  // tous deux le passer avant qu'aucun ne commite. Seul l'updateMany atomique
  // PENDING→PAID dans markOrderPaidWithWalletDebit désigne un gagnant unique
  // (transitioned===true). Le perdant (transitioned===false) DOIT s'arrêter ici,
  // sinon il (re)soumettrait la commande à Sinalite → DOUBLE PRODUCTION (le client
  // reçoit/paie 2× la même impression). Le crédit referral + l'email sont aussi
  // gardés (un seul award/notif).
  if (!transitioned) {
    logStripe.info(
      { orderId: order.id, intentId: intent.id },
      'order déjà finalisée par un event concurrent (transitioned=false) — skip Sinalite/referral/email',
    );
    return;
  }

  // Best-effort referral credit award (idempotent via @unique on refereeUserId)
  try {
    const { awardReferralCreditIfEligible } = await import('@/lib/referrals/award');
    await awardReferralCreditIfEligible({ userId: order.userId, orderId: order.id });
  } catch (err) {
    logStripe.error({ err, orderId: order.id }, 'referral award threw (non-fatal)');
  }

  // finding [129] — commande manuelle créée depuis un devis sur mesure
  // ACCEPTED (production hors Sinalite, cf. db/orders.ts createManualOrder).
  // `order.sinalitePayload` n'est ici qu'un descriptif inerte — JAMAIS un
  // SinaliteOrderRequest valide — le parser plus bas planterait à tort.
  // On s'arrête à PAID ; l'admin fait avancer le statut manuellement via
  // /api/admin/orders/[id]/status (déjà existant, accepte PAID→IN_PRODUCTION).
  if (order.skipSinaliteSubmission) {
    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      include: { user: true },
    });
    if (fresh) {
      await sendOrderConfirmationEmail({ order: fresh, user: fresh.user });
    }
    logStripe.info(
      { orderId: order.id, intentId: intent.id },
      'manual order (skipSinaliteSubmission) — paiement confirmé, aucune soumission Sinalite',
    );
    return;
  }

  let payloadSoumis: SinaliteOrderRequest;
  try {
    const instantane = SinaliteOrderRequest.parse(JSON.parse(order.sinalitePayload));
    // ⚠️ DANS LE MÊME try/catch QUE LE PARSE, à dessein. On est ici APRÈS la
    // transition irréversible PENDING→PAID : une levée non rattrapée
    // laisserait une commande payée, wallet débité, jamais soumise — et
    // SILENCIEUSE, car le rejeu Stripe ressort en amont sur
    // `status !== 'PENDING'` en rendant 200, ce qui efface la ligne
    // dead-letter. Le gestionnaire d'erreur du webhook n'alerte PAS : c'est
    // `markOrderFailed` qui rend l'échec visible.
    //
    // SEULE DÉVIATION par rapport à l'instantané : du texte libre. Les
    // articles, options, fichiers et montants sont rejoués tels quels.
    payloadSoumis = enrichirPayloadSoumis(instantane, order.id);
  } catch (err) {
    await markOrderFailed({
      orderId: order.id,
      reason: 'Invalid sinalitePayload snapshot',
      data: { error: err instanceof Error ? err.message : 'parse error' },
    });
    throw err;
  }

  // ═══ MARQUEUR D'INCERTITUDE — POSÉ AVANT L'APPEL ═══════════════════════
  //
  // Ce chemin porte ~100 % des commandes réelles ; le rejeu admin est
  // marginal. Il n'avait pourtant AUCUN marqueur, et le scénario était
  // déterministe :
  //
  //   `/order/new` expire à 15 s alors que Sinalite A CRÉÉ la commande → le
  //   `catch` tente `refunds.create`, qui échoue lui aussi (PaymentIntent dans
  //   un état qui refuse le remboursement) → `catch (refundErr)` →
  //   `markOrderFailed` + alerte « rembourse à la main ». État final : FAILED,
  //   `paidAt` posé, `sinaliteOrderId` null, aucun marqueur. L'admin ouvre la
  //   fiche : rien de rouge, bouton « Soumettre » actif. Il clique,
  //   `charges.list` rend `amount_refunded = 0` — le remboursement a échoué —
  //   tous les gardes passent. SECONDE PRODUCTION pour un seul encaissement.
  //
  // ⚠️ AVANT L'APPEL, et c'est le seul ordre qui vaut : le cas couvert est
  // précisément celui où le conteneur meurt sans jamais atteindre la ligne
  // suivante.
  //
  // ⚠️ LE VERROU `replayClaimedAt` EST POSÉ ICI AUSSI, et le premier jet de ce
  // lot ne le faisait pas — au motif que le webhook n'en a pas besoin contre
  // lui-même. C'est vrai et hors sujet. `markOrderPaidWithWalletDebit` est un
  // `updateMany` ATOMIQUE PENDING→PAID dont seul le gagnant descend jusqu'ici,
  // donc deux livraisons concurrentes de `payment_intent.succeeded` ne peuvent
  // effectivement pas soumettre toutes les deux.
  //
  // Mais cette colonne ne sert pas qu'à exclure : c'est LE SIGNAL « un envoi
  // est en vol », lu par l'encadré admin (`OrderActions`) et par la route de
  // levée d'incertitude. Un marqueur posé sans elle paraît périmé À LA
  // SECONDE : l'interface affiche « Soumission partie sans réponse » et
  // propose « J'ai vérifié » pendant que `/order/new` est encore en l'air.
  // L'admin regarde le portail, n'y voit rien — normal, la commande n'y est
  // pas ENCORE — lève le blocage de bonne foi, et relance. C'est très
  // exactement le défaut fermé en #582, réintroduit par l'autre chemin.
  //
  // Les deux chemins partagent donc le même verrou, ce qui ferme du même coup
  // la course INTER-CHEMINS dans les deux sens : le rejeu ne peut pas prendre
  // un verrou vivant, et sa pose porte la clause symétrique
  // `sinaliteSubmitUncertainAt: null`.
  const poseAt = new Date();
  const perime = new Date(poseAt.getTime() - PEREMPTION_VERROU_MS);
  const pose = await prisma.order.updateMany({
    where: {
      id: order.id,
      sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: null,
      // Péremption : sinon une tentative interrompue (conteneur tué) laisserait
      // un verrou éternel. Même seuil que le rejeu, même source.
      OR: [{ replayClaimedAt: null }, { replayClaimedAt: { lt: perime } }],
    },
    data: { sinaliteSubmitUncertainAt: poseAt, replayClaimedAt: poseAt },
  });
  if (pose.count === 0) {
    // Identifiant fournisseur déjà présent (commande soumise), marqueur déjà
    // posé (un doute subsiste), ou envoi encore en vol. Dans les trois cas, ne
    // RIEN envoyer : ne pas pouvoir prouver qu'on est seul, c'est ne pas
    // produire.
    logStripe.error(
      { orderId: order.id, intentId: intent.id },
      'webhook : soumission refusée — identifiant fournisseur, marqueur d’incertitude ou envoi en vol déjà présent',
    );
    await sendCriticalAlert({
      severity: 'critical',
      title: 'Webhook : soumission Sinalite refusée (commande déjà réclamée)',
      body:
        `Commande ${order.id} (${referencePlio(order.id)}) — le paiement est encaissé mais la ` +
        'soumission a été refusée : la commande porte déjà un identifiant fournisseur, un ' +
        'marqueur d’incertitude, ou un envoi encore en vol. Vérifie la fiche avant toute ' +
        'action manuelle — ne relance PAS à l’aveugle.',
      context: { orderId: order.id, paymentIntentId: intent.id },
      actionUrl: `/admin/orders/${order.id}`,
      actionLabel: 'Voir la commande',
    });
    return;
  }

  /**
   * Efface le marqueur ET le verrou qu'on a posés — et EUX SEULS.
   *
   * Les deux clauses `…: poseAt` sont la même discipline que la libération de
   * verrou du rejeu : sans elles, on effacerait le marqueur tout neuf d'un
   * AUTRE envoi, c'est-à-dire la faute même que ce marqueur existe pour
   * empêcher, déplacée de quelques lignes.
   *
   * ⚠️ N'EST PAS APPELÉE SUR UNE ISSUE INCONNUE, et c'est tout le sujet. Le
   * verrou y expire de lui-même au bout de `PEREMPTION_VERROU_MS` — c'est ce
   * délai qui donne à l'encadré admin sa fenêtre « Soumission en cours… »
   * avant de basculer sur « partie sans réponse ». Le marqueur, lui, ne
   * s'efface jamais tout seul.
   */
  const effacerMarqueur = async () => {
    await prisma.order.updateMany({
      where: { id: order.id, sinaliteSubmitUncertainAt: poseAt, replayClaimedAt: poseAt },
      data: { sinaliteSubmitUncertainAt: null, replayClaimedAt: null },
    });
  };

  // ⚠️ HISSÉS HORS DU `try`. Quand `markOrderSubmitted` ou l'envoi du courriel
  // échouent APRÈS une soumission réussie, on CONNAÎT l'identifiant
  // fournisseur — et le code précédent le jetait, pour ensuite REMBOURSER une
  // commande dont la production était lancée.
  let idFournisseur: number | null = null;
  // Distinct de `idFournisseur !== null` : `markOrderSubmitted` écrit le statut
  // ET l'identifiant dans une seule `$transaction`. Si elle lève, elle
  // ROLLBACK — l'identifiant nous est connu, mais absent de la base.
  let enregistre = false;

  try {
    const result = await sinalite.createOrder(payloadSoumis);
    idFournisseur = result.orderId;
    await markOrderSubmitted({
      orderId: order.id,
      sinaliteOrderId: result.orderId,
    });
    enregistre = true;
    // Effacé APRÈS `markOrderSubmitted`, pas après `createOrder` : entre les
    // deux, on connaît l'identifiant sans l'avoir encore enregistré. Si cette
    // écriture-là échoue, l'incertitude doit survivre.
    await effacerMarqueur();
    logStripe.info(
      { sinaliteOrderId: result.orderId, intentId: intent.id, orderId: order.id },
      'Sinalite order created',
    );

    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      include: { user: true },
    });
    if (fresh) {
      await sendOrderConfirmationEmail({ order: fresh, user: fresh.user });
    }
  } catch (err) {
    logStripe.error({ err, orderId: order.id, intentId: intent.id }, 'Sinalite createOrder FAILED');

    // ⚠️ LE REMBOURSEMENT AUTOMATIQUE N'EST PLUS INCONDITIONNEL.
    //
    // Il ne s'applique qu'aux échecs dont on peut PROUVER qu'ils précèdent la
    // création (`aucuneCreationPossible` — jeton, configuration, payload
    // invalide, ou refus de `/order/new` sur un code de la liste blanche).
    // Partout ailleurs, la commande existe peut-être : rembourser, c'est payer
    // une production ET rendre l'argent, puis annoncer au client une
    // annulation qui n'a pas eu lieu.
    //
    // ⚠️ `status = 200` EST UN ÉCHEC INCONNU, PAS UN REFUS. Un décalage de
    // schéma sur la réponse lève un `SinaliteError` portant le statut HTTP
    // réel (`res.ok` était vrai) : la commande a bien été créée, c'est son
    // identifiant qu'on a perdu. La liste blanche ne contient que des codes de
    // refus, donc ce cas retombe correctement dans l'inconnu.
    if (!(idFournisseur === null && aucuneCreationPossible(err))) {
      await traiterIssueNonProuvee({
        order,
        intentId: intent.id,
        err,
        idFournisseur,
        enregistre,
        effacerMarqueur,
      });
      throw err;
    }

    // ── Refus PROUVÉ avant création : rien n'existe chez le fournisseur. ──
    // Le marqueur n'a plus lieu d'être, et le remboursement automatique
    // historique s'applique tel quel.
    await effacerMarqueur();

    try {
      // Round 38 #3 — idempotencyKey : si le webhook Stripe retry pour
      // cette même intent.id (timeout réseau), on ne crée pas un 2ème
      // refund. Le PI ID est unique par charge donc parfait pour dedupe.
      const refund = await getStripe().refunds.create({
        payment_intent: intent.id,
        reason: 'requested_by_customer',
        metadata: {
          reason: 'sinalite_creation_failed',
          orderId: order.id,
          error: err instanceof Error ? err.message.slice(0, 500) : 'unknown',
        },
      }, { idempotencyKey: `auto_refund_${intent.id}` });
      await markRefundIssued({ orderId: order.id, refundId: refund.id, amountCents: refund.amount });
      // Audit v2 #1.2 — restaurer le crédit wallet débité (markOrderPaidWithWalletDebit
      // l'a débité plus haut ; le refund Stripe ne rend QUE la part Stripe). C'est
      // le chemin de refund le PLUS fréquent (échec imprimeur auto) et il ne
      // restaurait jamais le wallet → perte client silencieuse. Helper partagé,
      // idempotent (safe si le webhook retry) et non-fatal. actorId undefined =
      // système (pas un admin).
      const { restoreWalletCreditOnFullRefund } = await import('@/lib/wallet/operations');
      await restoreWalletCreditOnFullRefund({ order, refundId: refund.id });
      // Audit v2 #3.1 — symétrique pour le crédit referral débité à la confirmation.
      const { restoreReferralCreditOnFullRefund } = await import('@/lib/referrals/restore');
      await restoreReferralCreditOnFullRefund({ order, refundId: refund.id });
      await markOrderFailed({
        orderId: order.id,
        reason: err instanceof Error ? err.message : 'Sinalite createOrder failed',
        data: { refundId: refund.id },
      });
      logStripe.info(
        { intentId: intent.id, refundId: refund.id, orderId: order.id },
        'auto-refunded payment intent',
      );

      await sendCriticalAlert({
        severity: 'warning',
        title: 'Sinalite createOrder failed — auto-refund OK',
        body: `Le customer a été automatiquement remboursé. Si tu vois plusieurs alertes comme ça en peu de temps, vérifie Sinalite (wallet, credentials, status).`,
        context: {
          orderId: order.id,
          paymentIntentId: intent.id,
          refundId: refund.id,
          sinaliteError: err instanceof Error ? err.message : 'unknown',
        },
        actionUrl: `/admin/orders/${order.id}`,
        actionLabel: 'Voir la commande',
      });

      const fresh = await prisma.order.findUnique({
        where: { id: order.id },
        include: { user: true },
      });
      if (fresh) {
        // finding [50] — `err.message` (ex. « Sinalite POST order/new → 500 »)
        // révèle le nom du fournisseur au client, alors que le reste du site
        // l'anonymise soigneusement (aucune mention de « Sinalite » côté
        // customer-facing). Le détail technique reste dans le Slack alert
        // ci-dessous, les logs (l.471) et l'audit admin (markOrderFailed) —
        // seul le texte envoyé AU CLIENT est généralisé.
        const reason = 'Un problème technique est survenu au moment de lancer la production.';
        const cardLast4 = extractCardLast4(intent);
        await sendOrderCancelledEmail({
          order: fresh,
          user: fresh.user,
          reason,
          refundAmountCents: order.amountCents,
          cardLast4,
        });
        await sendRefundIssuedEmail({
          order: fresh,
          user: fresh.user,
          refundAmountCents: order.amountCents,
          reason,
          cardLast4,
        });
      }
    } catch (refundErr) {
      logStripe.fatal(
        { err: refundErr, sinaliteErr: err, orderId: order.id, intentId: intent.id },
        'CRITICAL: refund failed after Sinalite failure — manual intervention needed',
      );
      await markOrderFailed({
        orderId: order.id,
        reason: 'Sinalite failed AND refund failed — manual intervention needed',
        data: {
          sinaliteError: err instanceof Error ? err.message : 'unknown',
          refundError: refundErr instanceof Error ? refundErr.message : 'unknown',
        },
      });
      await sendCriticalAlert({
        severity: 'critical',
        title: 'Refund FAILED after Sinalite failure — manual intervention required',
        body:
          `Le client a été chargé mais on n'a pas pu créer la commande Sinalite NI rembourser via API. ` +
          `Action immédiate : ouvre Stripe Dashboard et rembourse manuellement, puis email le client.`,
        context: {
          orderId: order.id,
          paymentIntentId: intent.id,
          amountCents: order.amountCents,
          sinaliteError: err instanceof Error ? err.message : 'unknown',
          refundError: refundErr instanceof Error ? refundErr.message : 'unknown',
        },
        actionUrl: `/admin/orders/${order.id}`,
        actionLabel: 'Voir la commande',
      });
    }

    throw err;
  }
}

/**
 * Traite tout échec de soumission dont on ne peut PAS prouver qu'il précède la
 * création — et, par la même occasion, les échecs qui surviennent APRÈS une
 * création réussie.
 *
 * ⚠️ AUCUN REMBOURSEMENT N'EST ÉMIS ICI, dans aucune branche, et c'est le
 * cœur du correctif. Le code précédent remboursait sur TOUTE levée, y compris
 * quand `markOrderSubmitted` avait déjà écrit l'identifiant fournisseur et que
 * seul le courriel de confirmation avait échoué : production lancée, client
 * remboursé, courriel d'annulation envoyé. Un incident SES suffisait.
 *
 * Extrait en fonction plutôt qu'en branches imbriquées parce que chaque cas
 * doit être atteignable par un test isolé — c'est la seule façon de vérifier
 * par MUTATION que la bonne branche fait la bonne chose.
 */
async function traiterIssueNonProuvee(input: {
  order: { id: string; status: string; amountCents: number };
  intentId: string;
  err: unknown;
  idFournisseur: number | null;
  enregistre: boolean;
  effacerMarqueur: () => Promise<void>;
}) {
  const { order, intentId, err, idFournisseur, enregistre, effacerMarqueur } = input;
  const raison = err instanceof Error ? err.message.slice(0, 300) : 'inconnue';

  if (idFournisseur !== null && !enregistre) {
    // La soumission a RÉUSSI mais l'identifiant n'a pas été persisté
    // (transaction annulée). Le rattacher est la seule chose qui empêche un
    // second envoi, et on ne lève le marqueur QUE si ça marche.
    //
    // ⚠️ `sinaliteOrderId` est `@unique` : si ce numéro est déjà rattaché à
    // une autre commande, Prisma lève P2002. Sans ce filet, l'exception
    // sortirait d'ici et on perdrait l'alerte ET l'événement, précisément dans
    // le cas où la trace compte le plus.
    let rattache = { count: 0 };
    try {
      rattache = await prisma.order.updateMany({
        where: { id: order.id, sinaliteOrderId: null },
        data: { sinaliteOrderId: String(idFournisseur) },
      });
    } catch (e) {
      logStripe.error(
        { orderId: order.id, sinaliteOrderId: idFournisseur, err: e },
        'webhook : rattachement de l’identifiant fournisseur impossible',
      );
    }
    if (rattache.count > 0) await effacerMarqueur();

    // ⚠️ ALERTE D'ABORD, ÉCRITURES ENSUITE. La cause la plus probable d'un
    // rollback est une base indisponible — mettre l'écriture avant l'alerte
    // placerait le seul canal indépendant de la base derrière une écriture
    // qui, si elle lève, emporte l'alerte avec elle.
    await sendCriticalAlert({
      severity: 'critical',
      title: 'Webhook : commande SOUMISE, enregistrement ÉCHOUÉ',
      body:
        `Commande ${order.id} (${referencePlio(order.id)}) — soumission RÉUSSIE ` +
        `(fournisseur #${idFournisseur}) mais l'enregistrement a échoué. Rattachement ` +
        `automatique : ${rattache.count > 0 ? 'OK' : 'ÉCHOUÉ — rattacher à la main'}. ` +
        'Ne PAS relancer, ne PAS rembourser : la production est lancée.',
      context: { orderId: order.id, paymentIntentId: intentId, sinaliteOrderId: idFournisseur },
      actionUrl: `/admin/orders/${order.id}`,
      actionLabel: 'Voir la commande',
    });
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'SINALITE_SUBMIT_UNCERTAIN',
        data: JSON.stringify({ sinaliteOrderId: idFournisseur, rattache: rattache.count > 0, raison }),
      },
    });
    return;
  }

  if (idFournisseur !== null) {
    // L'ISSUE N'EST PAS INCONNUE : soumission réussie ET enregistrée. Seule
    // une écriture annexe a échoué — en pratique le courriel de confirmation.
    // Crier « partie sans réponse » serait faux, et bloquerait derrière une
    // vérification de portail qui n'a aucun lieu d'être.
    //
    // ⚠️ ALERTE AVANT L'ÉCRITURE, comme dans la branche précédente. Le premier
    // jet plaçait `effacerMarqueur()` en tête et appliquait donc la règle à
    // moitié, dans la même fonction : si la base est le composant en panne,
    // l'écriture lève et emporte avec elle le seul canal qui n'en dépend pas.
    await sendCriticalAlert({
      severity: 'warning',
      title: 'Webhook : commande soumise et enregistrée, courriel non envoyé',
      body:
        `Commande ${order.id} (${referencePlio(order.id)}) — soumission et enregistrement OK ` +
        `(fournisseur #${idFournisseur}). Seule une écriture annexe a échoué ; aucun risque de ` +
        'double production. Le client n’a peut-être pas reçu sa confirmation.',
      context: { orderId: order.id, paymentIntentId: intentId, sinaliteOrderId: idFournisseur },
      actionUrl: `/admin/orders/${order.id}`,
      actionLabel: 'Voir la commande',
    });
    await effacerMarqueur();
    return;
  }

  // ── ISSUE INCONNUE ────────────────────────────────────────────────────
  // L'envoi a PEUT-ÊTRE eu lieu. Le marqueur RESTE : il ne s'efface que sur
  // preuve, et la preuve est un humain qui a regardé le portail.
  //
  // Le client n'est ni remboursé ni prévenu d'une annulation, à dessein : on
  // ignore si sa commande est en production. Le geste juste est humain et
  // rapide — d'où l'alerte critique immédiate, le balayage quotidien du cron
  // `order-sla-alerts`, et la référence citable au portail dans les deux.
  await sendCriticalAlert({
    severity: 'critical',
    title: 'Webhook : soumission partie sans réponse — vérification portail requise',
    body:
      `Commande ${order.id} (${referencePlio(order.id)}) — /order/new a été émis, la réponse ` +
      "n'est jamais revenue. La commande existe PEUT-ÊTRE chez l'imprimeur.\n\n" +
      `Cherche « ${referencePlio(order.id)} » dans les notes au portail Sinalite AVANT toute ` +
      'action. AUCUN remboursement n’a été émis, précisément parce que la production est ' +
      "peut-être lancée. Le rejeu reste bloqué tant qu'un humain n'a pas tranché.\n\n" +
      "Trois issues, toutes sur la fiche :\n" +
      "· la commande Y EST → « Je l'ai trouvée — rattacher son numéro » ;\n" +
      "· elle n'y est PAS → « Rien au portail — lever le blocage », puis « Soumettre » ;\n" +
      "· l'imprimeur est hors service durablement → « Rembourser » et préviens le client. " +
      "Ne laisse pas la commande dans cet état : l'argent est encaissé et rien n'est produit.",
    context: { orderId: order.id, paymentIntentId: intentId, amountCents: order.amountCents, raison },
    actionUrl: `/admin/orders/${order.id}`,
    actionLabel: 'Voir la commande',
  });
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      kind: 'SINALITE_SUBMIT_UNCERTAIN',
      data: JSON.stringify({ raison, paymentIntentId: intentId }),
    },
  });
  // FAILED et non PAID : la commande DOIT ressortir comme un problème dans la
  // liste admin. Le libellé client (« Échec ») ne promet aucun remboursement,
  // donc il ne ment pas — et `failureReason` nomme l'incertitude au lieu
  // d'affirmer un échec.
  await markOrderFailed({
    orderId: order.id,
    reason: `Soumission Sinalite partie sans réponse — issue INCONNUE, vérification portail requise. Cause : ${raison}`,
    data: { paymentIntentId: intentId, soumissionIncertaine: true },
  });
}

/** Best-effort extraction du last4 de la card via PaymentIntent expand. */
function extractCardLast4(intent: Stripe.PaymentIntent): string | undefined {
  const charges = (intent as Stripe.PaymentIntent & {
    charges?: { data?: Array<{ payment_method_details?: { card?: { last4?: string } } }> };
  }).charges;
  return charges?.data?.[0]?.payment_method_details?.card?.last4;
}

async function handlePaymentFailed(
  intent: Stripe.PaymentIntent,
  ctx: { orderId?: string },
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { paymentIntentId: intent.id },
    include: { user: true },
  });
  if (!order) {
    logStripe.info({ intentId: intent.id }, 'payment failed (no matching order)');
    return;
  }
  ctx.orderId = order.id;
  const reason = intent.last_payment_error?.message ?? 'payment_failed';
  try {
    await markOrderFailed({
      orderId: order.id,
      reason,
      data: { code: intent.last_payment_error?.code },
    });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return;
    throw err;
  }

  // Notify the customer — best-effort, transactional (pas d'opt-out check).
  // Sinon le user pense que sa commande est en production et appelle le
  // support 3 jours plus tard.
  try {
    await sendPaymentFailedEmail({
      order,
      user: order.user,
      failureReason: reason,
    });
  } catch (err) {
    logStripe.error(
      { err, orderId: order.id },
      'payment-failed email send failed (order already marked FAILED)',
    );
  }
}
