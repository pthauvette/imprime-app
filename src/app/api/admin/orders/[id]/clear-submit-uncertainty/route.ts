/**
 * POST /api/admin/orders/[id]/clear-submit-uncertainty
 *
 * Lève l'état « `/order/new` émis, issue inconnue » — le SEUL moyen de le
 * lever, et il exige un humain.
 *
 * POURQUOI CETTE ROUTE EXISTE. Quand la réponse de `/order/new` ne revient
 * jamais (délai d'attente, conteneur Lambda tué), la commande peut exister chez
 * le fournisseur sans que rien ne l'indique chez nous : `sinaliteOrderId` reste
 * null, et si le conteneur a été tué le bloc `catch` du rejeu n'a même pas
 * tourné. Le verrou d'exécution `replayClaimedAt`, lui, EXPIRE — il rendait
 * donc le droit de recliquer, c'est-à-dire de produire une seconde fois, sans
 * qu'aucun signal ne dise qu'une commande existe peut-être déjà.
 *
 * ⚠️ CETTE ROUTE NE VÉRIFIE RIEN AUPRÈS DU FOURNISSEUR, ET C'EST ASSUMÉ.
 * Elle enregistre qu'un humain AFFIRME avoir vérifié au portail. C'est
 * exactement la nature du geste : une incertitude sur un appel money ne se
 * résout pas par une minuterie, mais elle ne se résout pas non plus par une
 * heuristique — `GET /order/list` ne permet pas de rattacher de façon fiable
 * une commande fournisseur à une commande Plio quand l'id n'a jamais été
 * enregistré. On trace donc QUI a levé le doute et QUAND, dans `AdminAudit`.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { PEREMPTION_VERROU_MS, verrouVivant } from '@/lib/orders/replay-lock';

export const POST = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { id } = await ctx.params;

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        sinaliteSubmitUncertainAt: true,
        sinaliteOrderId: true,
        replayClaimedAt: true,
      },
    });
    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }
    if (!order.sinaliteSubmitUncertainAt) {
      return NextResponse.json(
        { error: "Cette commande n'est pas en attente de vérification." },
        { status: 400 },
      );
    }

    // ⚠️ REFUS TANT QU'UN REJEU EST VIVANT — c'est LE garde de cette route.
    //
    // Le premier jet effaçait `replayClaimedAt` sans condition, et ça rouvrait
    // le trou que ce lot devait fermer, par un chemin plus court : un envoi
    // peut rester en vol jusqu'à ~25 s (jeton 10 s + `/order/new` 15 s). Or
    // dès que le marqueur est posé, l'interface affiche l'encadré et propose
    // « J'ai vérifié ». L'admin regarde le portail, n'y voit rien — normal, la
    // commande n'y est pas ENCORE — clique de bonne foi, et détruit le verrou
    // de la requête en cours. Il reclique : deuxième `/order/new`.
    //
    // Un seul admin, un seul onglet. Ce n'était pas une course rare : c'était
    // le parcours que l'interface proposait.
    if (verrouVivant(order.replayClaimedAt)) {
      const resteMs = PEREMPTION_VERROU_MS - (Date.now() - order.replayClaimedAt!.getTime());
      return NextResponse.json(
        {
          error:
            "Une soumission est peut-être ENCORE EN COURS pour cette commande — attends " +
            `${Math.ceil(resteMs / 60_000)} minute(s) avant de lever le blocage. ` +
            "Lever maintenant pourrait faire partir une seconde production.",
        },
        { status: 409 },
      );
    }

    // Le verrou périmé est nettoyé EN MÊME TEMPS : le garder n'aurait plus de
    // sens une fois l'incertitude levée. Conditionné sur le marqueur qu'on
    // vient de lire, pour ne pas écraser un état qui aurait changé entre la
    // lecture et l'écriture.
    const leve = await prisma.order.updateMany({
      where: {
        id: order.id,
        sinaliteSubmitUncertainAt: order.sinaliteSubmitUncertainAt,
        // Le verrou aussi : entre notre lecture et cette écriture, un rejeu a
        // pu reprendre la main. Sans cette clause on effacerait le verrou tout
        // neuf d'un envoi qui vient de partir — la faute même que ce garde
        // existe pour empêcher, déplacée de quelques lignes.
        replayClaimedAt: order.replayClaimedAt,
      },
      data: { sinaliteSubmitUncertainAt: null, replayClaimedAt: null },
    });
    if (leve.count === 0) {
      // Deux levées concurrentes, ou un rejeu qui a repris la main entre-temps.
      // Rendre le geste exactement-une-fois : sinon deux audits et deux
      // événements pour un seul acte.
      return NextResponse.json(
        { error: "L'état a changé entre-temps — recharge la fiche." },
        { status: 409 },
      );
    }

    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'SINALITE_SUBMIT_UNCERTAIN_CLEARED',
        data: JSON.stringify({
          adminEmail: guard.user.email,
          incertitudeDepuis: order.sinaliteSubmitUncertainAt,
        }),
      },
    });

    await recordAdminAudit({
      kind: 'ADMIN_CLEAR_SUBMIT_UNCERTAINTY',
      adminId: guard.userId,
      adminEmail: guard.user.email,
      targetType: 'ORDER',
      targetId: order.id,
      data: {
        incertitudeDepuis: order.sinaliteSubmitUncertainAt,
        sinaliteOrderId: order.sinaliteOrderId,
        previousStatus: order.status,
      },
    });

    return NextResponse.json({ ok: true });
  },
);
