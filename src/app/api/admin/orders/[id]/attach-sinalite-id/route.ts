/**
 * POST /api/admin/orders/[id]/attach-sinalite-id
 *
 * Rattache un numéro de commande fournisseur TROUVÉ AU PORTAIL, après une
 * soumission d'issue inconnue.
 *
 * POURQUOI CETTE ROUTE EXISTE. L'encadré « soumission partie sans réponse »
 * demande à un humain d'aller vérifier au portail Sinalite. Cette vérification
 * a DEUX issues, et une seule avait un geste :
 *
 *   ✓ rien au portail  → « J'ai vérifié » (clear-submit-uncertainty) → rejeu
 *                        rouvert.
 *   ✗ la commande EXISTE → …rien. Aucune route de l'application ne pouvait
 *                        écrire `sinaliteOrderId` — seuls le webhook Stripe et
 *                        le rejeu le font, tous deux à partir de leur propre
 *                        réponse `/order/new`.
 *
 * L'admin n'avait donc que de mauvais choix : lever l'incertitude (ce qui
 * affirme par écrit, à son nom, qu'il n'a rien vu — alors qu'il a vu), ou ne
 * rien faire. Dans les deux cas la commande restait SANS identifiant
 * fournisseur, donc invisible aux webhooks de statut Sinalite (rapprochés par
 * `sinaliteOrderId`) et au cron de réconciliation : jamais IN_PRODUCTION,
 * jamais SHIPPED, aucun suivi pour le client, pour une commande bel et bien en
 * production.
 *
 * Une interface qui exige une vérification doit offrir un geste pour CHAQUE
 * issue de cette vérification, sinon elle pousse à mentir.
 *
 * ⚠️ CETTE ROUTE NE VÉRIFIE RIEN AUPRÈS DU FOURNISSEUR. Comme la levée
 * d'incertitude, elle enregistre ce qu'un humain AFFIRME avoir lu au portail,
 * et trace qui l'a affirmé. Le garde qui compte est ailleurs : `sinaliteOrderId`
 * est `@unique`, donc un numéro déjà rattaché à une AUTRE commande est refusé
 * par la base plutôt que de corrompre les deux fiches.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { markOrderSubmitted } from '@/lib/db/orders';
import { PEREMPTION_VERROU_MS, verrouVivant } from '@/lib/orders/replay-lock';

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { id } = await ctx.params;

    const body = (await req.json().catch(() => ({}))) as { sinaliteOrderId?: unknown };
    // Entier strictement positif. `Number('12abc')` rend NaN, `Number('')`
    // rend 0 : les deux doivent échouer ici plutôt que d'écrire « 0 » ou
    // « NaN » dans une colonne qui sert de clé de rapprochement.
    const brut = typeof body.sinaliteOrderId === 'string' ? Number(body.sinaliteOrderId) : body.sinaliteOrderId;
    if (typeof brut !== 'number' || !Number.isInteger(brut) || brut <= 0) {
      return NextResponse.json(
        { error: 'Numéro de commande fournisseur invalide — un entier positif est attendu.' },
        { status: 400 },
      );
    }

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paidAt: true,
        sinaliteOrderId: true,
        sinaliteSubmitUncertainAt: true,
        replayClaimedAt: true,
      },
    });
    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }
    if (order.sinaliteOrderId) {
      return NextResponse.json(
        { error: `Cette commande porte déjà le numéro fournisseur ${order.sinaliteOrderId}.` },
        { status: 400 },
      );
    }
    // ⚠️ RÉSERVÉE À LA RÉSOLUTION D'UNE INCERTITUDE, et pas un champ libre.
    // Sans ce garde, la route deviendrait un moyen d'écrire n'importe quel
    // numéro sur n'importe quelle commande — donc de faire passer une commande
    // jamais soumise pour une commande en production.
    if (!order.sinaliteSubmitUncertainAt) {
      return NextResponse.json(
        { error: "Cette commande n'est pas en attente de vérification — rien à rattacher." },
        { status: 400 },
      );
    }
    // Cohérence avec le rejeu : jamais encaissée, rien à produire — donc rien
    // à rattacher non plus. Défense en profondeur (un marqueur sans `paidAt`
    // ne devrait pas exister).
    if (!order.paidAt) {
      return NextResponse.json(
        { error: 'Commande jamais encaissée (paidAt absent) — rattachement refusé.' },
        { status: 400 },
      );
    }
    // `markOrderSubmitted` n'accepte que PAID|FAILED comme statuts antérieurs.
    // Sans ce test, une commande annulée qui traîne un marqueur rendait un 500
    // nu, et le seul geste restant devenait « rien au portail » — c'est-à-dire
    // l'affirmation fausse que cette route existe justement pour éviter.
    if (order.status !== 'PAID' && order.status !== 'FAILED') {
      return NextResponse.json(
        {
          error:
            `Statut ${order.status} incompatible avec un rattachement. Si une commande existe ` +
            "vraiment chez l'imprimeur, écris-le en note interne et traite le cas à la main.",
        },
        { status: 400 },
      );
    }
    // ⚠️ MÊME REFUS QUE LA LEVÉE D'INCERTITUDE. Tant qu'un envoi peut être en
    // vol, ce que l'admin voit au portail est un instantané périmé : le numéro
    // qu'il lit peut appartenir à une soumission dont NOTRE processus va
    // recevoir la réponse dans la seconde, et qui écrira le même identifiant.
    if (verrouVivant(order.replayClaimedAt)) {
      const resteMs = PEREMPTION_VERROU_MS - (Date.now() - order.replayClaimedAt!.getTime());
      return NextResponse.json(
        {
          error:
            "Une soumission est peut-être ENCORE EN COURS pour cette commande — attends " +
            `${Math.ceil(resteMs / 60_000)} minute(s) avant de rattacher un numéro.`,
        },
        { status: 409 },
      );
    }

    // ⚠️ LE TEST DE VERROU CI-DESSUS EST UN READ-THEN-ACT — il faut le
    // refermer par une écriture ATOMIQUE, sinon il ne prouve rien.
    //
    // Entre notre lecture et l'écriture, une soumission peut reprendre la
    // main (webhook Stripe ou rejeu admin : les deux posent ce verrou). On
    // écrirait alors un numéro pendant qu'un autre `/order/new` est en vol —
    // pas de double production, mais une fiche FAUSSE, et le
    // `markOrderSubmitted` de l'envoi en vol tomberait dans sa branche
    // « rattacher à la main » pour un identifiant qu'on avait sous la main.
    //
    // On prend donc le verrou à notre nom, conditionné sur EXACTEMENT ce
    // qu'on a lu. Même discipline que `clear-submit-uncertainty`.
    const prisAt = new Date();
    const priseVerrou = await prisma.order.updateMany({
      where: {
        id: order.id,
        sinaliteOrderId: null,
        sinaliteSubmitUncertainAt: order.sinaliteSubmitUncertainAt,
        replayClaimedAt: order.replayClaimedAt,
      },
      data: { replayClaimedAt: prisAt },
    });
    if (priseVerrou.count === 0) {
      return NextResponse.json(
        { error: "L'état a changé entre-temps — recharge la fiche." },
        { status: 409 },
      );
    }

    // `markOrderSubmitted` écrit le statut ET l'identifiant dans une seule
    // transaction (priors PAID|FAILED — les deux états possibles ici). Si elle
    // lève, RIEN n'est écrit et le marqueur survit : c'est l'ordre voulu.
    try {
      await markOrderSubmitted({ orderId: order.id, sinaliteOrderId: brut });
    } catch (err) {
      // Le verrou qu'on vient de prendre est rendu : sans ça, un numéro mal
      // lu condamnerait la fiche à cinq minutes d'attente avant la moindre
      // seconde tentative. Porté, comme partout ailleurs.
      await prisma.order.updateMany({
        where: { id: order.id, replayClaimedAt: prisAt },
        data: { replayClaimedAt: order.replayClaimedAt },
      });
      // P2002 = ce numéro est déjà rattaché à une AUTRE commande Plio. C'est
      // le cas le plus probable d'erreur humaine (chiffre lu de travers au
      // portail), et le message doit le dire au lieu de rendre un 500 nu.
      const conflit =
        typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
      log.error({ orderId: order.id, sinaliteOrderId: brut, err }, 'rattachement fournisseur refusé');
      return NextResponse.json(
        {
          error: conflit
            ? `Le numéro ${brut} est DÉJÀ rattaché à une autre commande Plio. Revérifie le numéro au portail.`
            : `Rattachement impossible : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
        },
        { status: conflit ? 409 : 500 },
      );
    }

    // Marqueur et verrou levés SEULEMENT maintenant, et portés par le verrou
    // qu'on a PRIS (`prisAt`) : c'est lui qui prouve que personne n'est passé
    // entre-temps. Le rejeu est de toute façon bloqué désormais par
    // `sinaliteOrderId`.
    await prisma.order.updateMany({
      where: {
        id: order.id,
        sinaliteSubmitUncertainAt: order.sinaliteSubmitUncertainAt,
        replayClaimedAt: prisAt,
      },
      data: { sinaliteSubmitUncertainAt: null, replayClaimedAt: null },
    });

    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'SINALITE_SUBMIT_UNCERTAIN_CLEARED',
        data: JSON.stringify({
          adminEmail: guard.user.email,
          rattacheSinaliteOrderId: brut,
          incertitudeDepuis: order.sinaliteSubmitUncertainAt,
        }),
      },
    });

    await recordAdminAudit({
      kind: 'ADMIN_ATTACH_SINALITE_ID',
      adminId: guard.userId,
      adminEmail: guard.user.email,
      targetType: 'ORDER',
      targetId: order.id,
      data: {
        sinaliteOrderId: brut,
        incertitudeDepuis: order.sinaliteSubmitUncertainAt,
        previousStatus: order.status,
      },
    });

    return NextResponse.json({ ok: true, sinaliteOrderId: brut });
  },
);
