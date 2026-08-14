/**
 * POST /api/admin/orders/[id]/replay-sinalite
 *
 * Re-soumet une commande à Sinalite. Cas d'usage :
 *   - L'order est en FAILED (Sinalite a refusé la première fois) → on retry
 *   - L'order est PAID mais SUBMITTED a pas marché (bug webhook) → on rattrape
 *   - L'admin veut force-resync
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { withErrorHandler } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAdminAudit } from "@/lib/db/admin-audit";
import { sinalite, SinaliteError } from "@/lib/sinalite/client";
import { enrichirPayloadSoumis } from "@/lib/sinalite/order-notes";
import { getStripe } from '@/lib/stripe/client';
import { formatCents } from '@/lib/format';
import { SinaliteOrderRequest } from "@/lib/sinalite/types";
import { markOrderSubmitted, markOrderFailed } from "@/lib/db/orders";
import { sendOrderConfirmationEmail } from "@/lib/emails/send";

export const POST = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { id } = await ctx.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    // ⚠️ COURSE ENCORE OUVERTE — lire avant de croire ce garde.
    // Ce test est un read-then-act : deux requêtes concurrentes lisent toutes
    // deux `sinaliteOrderId === null` et soumettent DEUX FOIS, donc deux
    // productions réelles facturées. Le webhook Stripe, lui, est protégé par
    // un `updateMany` ATOMIQUE (`markOrderPaidWithWalletDebit`) ; ici il n'y a
    // aucune colonne ni contrainte d'unicité utilisable pour réclamer la
    // commande. Une migration n'est PAS nécessaire pour autant : `WebhookEvent`
    // porte déjà un `@@unique([source, eventId])`, et `recordWebhookOutcome`
    // est un INSERT-or-IGNORE atomique qui rend `{ isNew }` — une réclamation
    // `eventId: 'admin_replay_' + order.id` fermerait la course sans toucher au
    // schéma. Le coût : un rejeu ultérieur légitime devrait être débloqué à la
    // main. C'est une décision produit, pas un obstacle technique.
    //
    // Ce qui est fermé, et qui est le vrai danger : la production lancée sur
    // une commande JAMAIS ENCAISSÉE ou DÉJÀ REMBOURSÉE (gardes ci-dessus),
    // déterministe avec un seul admin et un seul clic. Plus la soumission
    // intraçable — les transitions du rejeu sont désormais permises, donc un
    // rejeu réussi est enregistré au lieu de lever après avoir lancé la
    // production.
    //
    // Ce qui reste ouvert : deux onglets, ou deux administrateurs, à quelques
    // millisecondes d'écart. Rare, privilégié, auto-infligé.
    if (order.sinaliteOrderId) {
      return NextResponse.json(
        {
          error: "Order already submitted to Sinalite",
          sinaliteOrderId: order.sinaliteOrderId,
        },
        { status: 400 },
      );
    }
    // ⚠️ JAMAIS ENCAISSÉE → RIEN À PRODUIRE.
    // Il n'y avait aucun test de paiement ici. Le chemin est direct : un client
    // abandonne au 3-D Secure, `payment_intent.payment_failed` marque la
    // commande FAILED avec `paidAt = null` — et l'admin voit « Échec » dans la
    // liste, ce qui est LITTÉRALEMENT le cas d'usage n°1 de ce bouton. Un clic
    // lançait une production réelle facturée à Plio, pour zéro dollar encaissé.
    if (!order.paidAt) {
      return NextResponse.json(
        { error: "Commande jamais encaissée (paidAt absent) — aucune production à relancer." },
        { status: 400 },
      );
    }

    if (order.status === "PENDING" || order.status === "CANCELLED") {
      return NextResponse.json(
        { error: `Cannot replay an order in ${order.status} status` },
        { status: 400 },
      );
    }
    // finding [129] — commande manuelle depuis un devis sur mesure (production
    // hors Sinalite) : sinalitePayload est un JSON inerte, jamais un vrai
    // SinaliteOrderRequest. Sans ce guard, on tombe quand même proprement sur
    // l'erreur de parse ci-dessous (fail-safe), mais avec un message cryptique —
    // défense en profondeur explicite ici.
    if (order.skipSinaliteSubmission) {
      return NextResponse.json(
        {
          error:
            "Commande manuelle (devis sur mesure) — production gérée hors Sinalite, rien à soumettre.",
        },
        { status: 400 },
      );
    }

    // ═══ VERROU ATOMIQUE ═══════════════════════════════════════════════
    // Le garde `sinaliteOrderId` plus haut est un read-then-act : deux
    // requêtes concurrentes le franchissent toutes deux. Seul un `updateMany`
    // conditionnel départage — c'est ce que fait le webhook Stripe, et ce
    // chemin ne l'avait pas.
    //
    // POSÉ AVANT LA VÉRIFICATION DES REMBOURSEMENTS : un seul rejeu peut être
    // en vol, donc deux rejeux ne peuvent plus lire Stripe chacun de leur côté
    // puis soumettre tous les deux.
    //
    // ⚠️ CE VERROU NE FERME PAS LA FENÊTRE TOCTOU DU REMBOURSEMENT, et un jet
    // précédent l'affirmait — à tort, jusque dans un nom de test. Il sérialise
    // REJEU CONTRE REJEU, rien d'autre : ni `/api/admin/orders/[id]/refund` ni
    // le Dashboard Stripe ne lisent `replayClaimedAt`. Un admin peut donc
    // toujours rembourser entre notre lecture de `charges.list` et l'envoi à
    // `/order/new`. Cette fenêtre est exactement aussi ouverte qu'avant.
    //
    // Péremption : une tentative interrompue (Lambda tuée, réseau coupé)
    // laisserait sinon un verrou éternel sur une route dont TOUT l'objet est
    // de réessayer.
    const PEREMPTION_VERROU_MS = 5 * 60_000;
    const perime = new Date(Date.now() - PEREMPTION_VERROU_MS);
    const prisAt = new Date();
    const verrou = await prisma.order.updateMany({
      where: {
        id: order.id,
        sinaliteOrderId: null,
        OR: [{ replayClaimedAt: null }, { replayClaimedAt: { lt: perime } }],
      },
      data: { replayClaimedAt: prisAt },
    });
    if (verrou.count === 0) {
      return NextResponse.json(
        { error: "Un rejeu est déjà en cours pour cette commande. Réessaie dans quelques minutes." },
        { status: 409 },
      );
    }

    /**
     * Libère le verrou. À appeler sur TOUTE sortie qui ne soumet pas —
     * sinon un refus légitime bloquerait la commande pendant la péremption.
     * Jamais après une soumission réussie : `sinaliteOrderId` prend le relais.
     */
    const libererVerrou = async () => {
      const r = await prisma.order.updateMany({
        // `replayClaimedAt: prisAt` — on ne libère QUE le verrou qu'on a posé
        // soi-même. Sans cette clause, une requête qui survit à sa propre
        // péremption effacerait le verrou de la suivante : « atomique » à la
        // prise, et n'importe quoi à la libération.
        where: { id: order.id, sinaliteOrderId: null, replayClaimedAt: prisAt },
        data: { replayClaimedAt: null },
      });
      // `count === 0` = on n'a pas libéré notre verrou (quelqu'un l'a repris
      // après péremption, ou la commande a été soumise entre-temps). Sans
      // trace, ça se manifesterait par 5 minutes de blocage inexpliqué.
      if (r.count === 0) {
        log.warn({ orderId: order.id }, 'rejeu sinalite : libération de verrou sans effet');
      }
    };

    // ⚠️ DÉJÀ REMBOURSÉE → NE PAS PRODUIRE.
    // C'est le cas le PLUS fréquent parmi les commandes FAILED sans
    // sinaliteOrderId : l'auto-refund déclenché quand Sinalite refuse la
    // soumission rembourse intégralement puis marque FAILED. La population
    // cible de ce bouton est donc majoritairement composée de commandes déjà
    // remboursées. Rejouer, c'est payer l'impression ET avoir rendu l'argent.
    //
    // ⚠️ LA SOURCE DE VÉRITÉ EST STRIPE, PAS NOS `OrderEvent`.
    // Premier jet : `count({ kind: 'REFUND_ISSUED' })`. Ça ne voit que les
    // remboursements passés par NOTRE code. Or quand l'auto-refund échoue à
    // son tour, l'alerte critique dit textuellement à l'admin d'aller
    // rembourser dans le Dashboard Stripe (`stripe-process.ts`) — et il
    // n'existe aucun handler `charge.refunded` chez nous. Le garde ratait donc
    // exactement la population que notre propre runbook fabrique. Même
    // dérivation que `/api/admin/orders/[id]/refund`.
    //
    // ⚠️ `charges.list` ET NON `refunds.list` : l'objet Charge expose À LA FOIS
    // `amount_refunded` et `disputed`. Une CONTESTATION de carte n'est pas un
    // remboursement — elle n'apparaît nulle part dans `refunds.list` — et le
    // scénario est fabriqué par notre propre runbook : soumission échouée,
    // auto-refund échoué lui aussi, alerte qui demande une intervention
    // manuelle, client sans nouvelles qui conteste auprès de sa banque. Stripe
    // retient alors le montant ET les frais, et le bouton « rejouer » lançait
    // la presse. Un seul appel couvre les deux.
    // ⚠️ Pas d'identifiant de paiement → REFUS, jamais « zéro remboursement ».
    // La colonne est NOT NULL aujourd'hui, donc cette branche est morte ; le
    // jour où elle ne l'est plus, un `rembourseCents = 0` implicite sauterait
    // toute la vérification et produirait. Dans un garde fail-closed, ne pas
    // pouvoir vérifier doit refuser.
    if (!order.paymentIntentId) {
      await libererVerrou();
      return NextResponse.json(
        { error: "Aucun identifiant de paiement — impossible de vérifier les remboursements." },
        { status: 409 },
      );
    }

    let rembourseCents = 0;
    let conteste = false;
    {
      try {
        const charges = await getStripe().charges.list(
          { payment_intent: order.paymentIntentId, limit: 100 },
          // Borne POSÉE ICI et nulle part ailleurs : cet appel est le seul
          // enfermé DANS le verrou à péremption. Aux défauts de la librairie
          // (80 s × 3 tentatives ≈ 250 s), il mangerait le budget de 300 s et
          // rouvrirait la double soumission qu'on vient de fermer.
          { timeout: 10_000, maxNetworkRetries: 1 },
        );
        for (const c of charges.data) {
          rembourseCents += c.amount_refunded ?? 0;
          if (c.disputed) conteste = true;
        }
      } catch (err) {
        // Fail-closed : ne pas savoir, c'est ne pas produire. La sanction d'un
        // faux négatif ici est « imprimer gratuitement ».
        await libererVerrou();
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? `Impossible de vérifier les remboursements : ${err.message}`
                : "Impossible de vérifier les remboursements existants",
          },
          { status: 502 },
        );
      }
    }
    if (conteste) {
      await libererVerrou();
      return NextResponse.json(
        {
          error:
            "Paiement CONTESTÉ auprès de la banque — Stripe retient le montant et les frais. " +
            "Relancer la production ferait payer l'impression sans contrepartie. " +
            "⚠️ Ce blocage est PERMANENT : `disputed` reste vrai même après une contestation " +
            "gagnée. Vérifie l'issue au portail Stripe et passe par une commande neuve.",
        },
        { status: 409 },
      );
    }

    if (rembourseCents > 0) {
      await libererVerrou();
      // `formatCents` et non `.toFixed(2)` : ce dernier produit « 15.00 », un
      // point décimal anglais dans une application fr-CA. Le dépôt a ce
      // helper précisément parce que 48 sites le faisaient à la main.
      const total = formatCents(order.amountCents);
      const rendu = formatCents(rembourseCents);
      return NextResponse.json(
        {
          error:
            rembourseCents >= order.amountCents
              ? `Commande entièrement remboursée (${rendu}) — relancer la production ferait payer l'impression sans contrepartie.`
              : `${rendu} déjà remboursés sur ${total} — décision manuelle requise avant de relancer la production.`,
        },
        { status: 409 },
      );
    }

    let payload;
    try {
      payload = SinaliteOrderRequest.parse(JSON.parse(order.sinalitePayload));
    } catch {
      await libererVerrou();
      return NextResponse.json(
        { error: "Invalid sinalitePayload snapshot" },
        { status: 500 },
      );
    }

    try {
      // Même enrichissement que le webhook — sinon le seul bon de production
      // sans numéro citable serait celui d'un rejeu manuel.
      const result = await sinalite.createOrder(
        enrichirPayloadSoumis(payload, order.id),
      );
      await markOrderSubmitted({
        orderId: order.id,
        sinaliteOrderId: result.orderId,
      });
      // Best-effort confirmation email (now that we have a Sinalite ID)
      const fresh = await prisma.order.findUnique({
        where: { id: order.id },
        include: { user: true },
      });
      if (fresh) {
        await sendOrderConfirmationEmail({ order: fresh, user: fresh.user });
      }
      await recordAdminAudit({
        kind: "ADMIN_REPLAY_SINALITE",
        adminId: guard.userId,
        adminEmail: guard.user.email,
        targetType: "ORDER",
        targetId: order.id,
        data: {
          sinaliteOrderId: result.orderId,
          previousStatus: order.status,
          success: true,
          customerEmail: order.user.email,
        },
      });
      return NextResponse.json({ ok: true, sinaliteOrderId: result.orderId });
    } catch (err) {
      // ⚠️ LIBÉRATION CONDITIONNELLE, et la condition est « a-t-on VRAIMENT
      // envoyé /order/new ? ».
      //
      // Une levée APRÈS l'envoi ne prouve pas que le fournisseur n'a rien créé
      // — un délai d'attente sur la réponse laisse une commande bien réelle de
      // l'autre côté — donc on garde le verrou.
      //
      // ⚠️ ET LA PÉREMPTION NE RÈGLE RIEN : au bout de 5 minutes elle REND le
      // risque à l'admin, qui recliquera sans avoir le moindre signal qu'une
      // commande existe peut-être déjà chez le fournisseur. Une incertitude
      // sur un appel money ne se résout pas par une minuterie. Fermer ça
      // demande un marqueur DURABLE « /order/new émis, issue inconnue » + une
      // alerte critique + un déblocage humain explicite — ticket séparé, ce
      // verrou en est le socle.
      //
      // Mais `sinalite.createOrder` lève AUSSI avant tout paquet. Deux cas
      // seulement sont reconnus par ce test, et c'est VOLONTAIREMENT écrit
      // ainsi plutôt que « tous les échecs pré-envoi » :
      //   ✓ configuration invalide → `SinaliteError(…, '<config>')`
      //   ✓ `/auth/token` en 401   → `SinaliteError(…, '/auth/token')`
      //   ✗ `/auth/token` en TIMEOUT → `DOMException`, pas une `SinaliteError`
      //   ✗ validation locale du payload → `ZodError`
      // Les deux derniers CONSERVENT donc le verrou. C'est fail-closed, donc
      // sans risque d'argent — simplement cinq minutes d'attente de trop. Un
      // commentaire qui promettrait les quatre serait faux, et ce dépôt vient
      // d'en retirer deux du même genre.
      //
      // Le cas qui compte est couvert : identifiants fournisseur expirés,
      // l'échec de rejeu le plus banal. Ne pas libérer condamnait l'admin à un
      // 409 « rejeu déjà en cours » pendant cinq minutes, sur une route dont
      // l'objet est justement de réessayer.
      const preEnvoi =
        err instanceof SinaliteError && err.endpoint !== '/order/new';
      if (preEnvoi) await libererVerrou();

      const reason =
        err instanceof Error ? err.message : "Sinalite replay failed";
      // Audit admin 2026-07 §8.3 — ne PAS dégrader une commande valide. Avant, un
      // hoquet transitoire Sinalite (503, timeout) pendant un replay de rattrapage
      // faisait basculer une commande PAID en FAILED : l'action de RATTRAPAGE
      // empirait l'état (fausse alerte « Échecs », email d'échec possible). On ne
      // marque FAILED que si la commande l'était déjà ; sinon on conserve le statut
      // et on trace l'échec dans la timeline (OrderEvent ERROR) + l'audit.
      if (order.status === "FAILED") {
        await markOrderFailed({
          orderId: order.id,
          reason,
          data: { adminUserId: guard.userId, action: "replay-sinalite" },
        });
      } else {
        await prisma.orderEvent.create({
          data: {
            orderId: order.id,
            kind: "ERROR",
            data: JSON.stringify({
              action: "replay-sinalite",
              reason,
              adminUserId: guard.userId,
              statusKept: order.status,
            }),
          },
        });
      }
      await recordAdminAudit({
        kind: "ADMIN_REPLAY_SINALITE",
        adminId: guard.userId,
        adminEmail: guard.user.email,
        targetType: "ORDER",
        targetId: order.id,
        data: {
          success: false,
          reason,
          previousStatus: order.status,
          customerEmail: order.user.email,
        },
      });
      return NextResponse.json({ error: reason }, { status: 502 });
    }
  },
);
