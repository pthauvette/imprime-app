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
import { withErrorHandler } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAdminAudit } from "@/lib/db/admin-audit";
import { sinalite } from "@/lib/sinalite/client";
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
    // Limite connue et assumée : une CONTESTATION de carte (`charge.dispute.*`)
    // n'apparaît pas dans `refunds.list`. Ce chemin-là reste ouvert.
    // ⚠️ Pas d'identifiant de paiement → REFUS, jamais « zéro remboursement ».
    // La colonne est NOT NULL aujourd'hui, donc cette branche est morte ; le
    // jour où elle ne l'est plus, un `rembourseCents = 0` implicite sauterait
    // toute la vérification et produirait. Dans un garde fail-closed, ne pas
    // pouvoir vérifier doit refuser.
    if (!order.paymentIntentId) {
      return NextResponse.json(
        { error: "Aucun identifiant de paiement — impossible de vérifier les remboursements." },
        { status: 409 },
      );
    }

    let rembourseCents = 0;
    {
      try {
        const refunds = await getStripe().refunds.list({
          payment_intent: order.paymentIntentId,
          limit: 100,
        });
        rembourseCents = refunds.data
          .filter((r) => r.status !== "failed" && r.status !== "canceled")
          .reduce((somme, r) => somme + r.amount, 0);
      } catch (err) {
        // Fail-closed : ne pas savoir, c'est ne pas produire. La sanction d'un
        // faux négatif ici est « imprimer gratuitement ».
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
    if (rembourseCents > 0) {
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
