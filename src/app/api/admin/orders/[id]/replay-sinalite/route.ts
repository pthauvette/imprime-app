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
import { PEREMPTION_VERROU_MS } from "@/lib/orders/replay-lock";
import { sendCriticalAlert } from "@/lib/alerting/slack";
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
    // Ce qui était resté ouvert — deux onglets, deux administrateurs — est
    // FERMÉ depuis la prise atomique ci-dessous : un seul rejeu peut être en
    // vol. Ce commentaire décrivait l'état d'avant ce verrou.
    if (order.sinaliteOrderId) {
      return NextResponse.json(
        {
          error: "Order already submitted to Sinalite",
          sinaliteOrderId: order.sinaliteOrderId,
        },
        { status: 400 },
      );
    }
    // ⚠️ SOUMISSION D'ISSUE INCONNUE → NE PAS RELANCER.
    // `/order/new` est parti une fois sans que la réponse revienne. La commande
    // existe PEUT-ÊTRE chez le fournisseur. Le verrou d'exécution expire au
    // bout de quelques minutes ; ce marqueur-ci, non — il ne se lève que sur
    // preuve, et la preuve est un humain qui a regardé le portail.
    if (order.sinaliteSubmitUncertainAt) {
      return NextResponse.json(
        {
          error:
            "Une soumission précédente est partie sans réponse — la commande existe PEUT-ÊTRE déjà " +
            "chez l'imprimeur. Vérifie au portail Sinalite (apifrontend.sinaliteuppy.com) avant de " +
            "relancer, puis lève le blocage depuis la fiche de commande.",
          depuis: order.sinaliteSubmitUncertainAt,
        },
        { status: 409 },
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

    // ⚠️ POSÉ AVANT L'APPEL, et c'est le seul ordre qui vaut. Après, il serait
    // inutile : le cas qu'on couvre est précisément celui où le processus meurt
    // sans jamais atteindre la ligne suivante.
    // ⚠️ POSE PORTÉE PAR LE PROPRIÉTAIRE (`replayClaimedAt: prisAt`) et
    // horodatage MÉMORISÉ. Sans ça, le succès d'une requête A effacerait le
    // marqueur posé par B — « propriétaire » à la libération du verrou et
    // n'importe quoi ici aurait été la même faute, déplacée d'un cran.
    const poseAt = new Date();
    const pose = await prisma.order.updateMany({
      // ⚠️ `sinaliteOrderId: null` RÉAFFIRMÉ ici. La prise du verrou et sa
      // libération le portent toutes deux ; la pose — seule écriture juste
      // avant l'appel IRRÉVERSIBLE — ne l'avait pas. Or entre la prise et ce
      // point s'intercale `charges.list`, jusqu'à 20 s pendant lesquelles le
      // webhook Stripe peut parfaitement écrire l'id. Sans cette clause, on
      // soumettait une commande déjà soumise.
      where: { id: order.id, replayClaimedAt: prisAt, sinaliteOrderId: null },
      data: { sinaliteSubmitUncertainAt: poseAt },
    });
    if (pose.count === 0) {
      // On a perdu le verrou entre-temps (péremption + reprise par une autre
      // requête). Ne rien envoyer : c'est l'autre qui a la main.
      return NextResponse.json(
        { error: "Le verrou de rejeu a été repris — réessaie dans quelques minutes." },
        { status: 409 },
      );
    }

    // ⚠️ HISSÉ HORS DU `try`. Quand `markOrderSubmitted` ou l'envoi du courriel
    // échouent APRÈS une soumission réussie, on CONNAÎT l'id fournisseur — et
    // le premier jet le jetait, pour envoyer ensuite un humain fouiller le
    // portail à la recherche d'un numéro qu'on avait sous la main.
    let idFournisseur: number | null = null;
    // ⚠️ DISTINCT de `idFournisseur !== null`, et c'est tout le sujet.
    // `markOrderSubmitted` écrit le statut ET `sinaliteOrderId` dans une SEULE
    // `$transaction` : si elle lève, elle ROLLBACK — l'id est connu de nous,
    // mais absent de la base. Effacer le marqueur dans ce cas rendait le
    // bouton cliquable après péremption, avec `sinaliteOrderId` toujours nul :
    // deuxième production, et le seul témoin de la première était un message
    // Slack (que `sendCriticalAlert` n'envoie même pas sans webhook configuré).
    let enregistre = false;

    try {
      // Même enrichissement que le webhook — sinon le seul bon de production
      // sans numéro citable serait celui d'un rejeu manuel.
      const result = await sinalite.createOrder(
        enrichirPayloadSoumis(payload, order.id),
      );
      idFournisseur = result.orderId;
      await markOrderSubmitted({
        orderId: order.id,
        sinaliteOrderId: result.orderId,
      });
      enregistre = true;
      // Effacé APRÈS `markOrderSubmitted`, pas après `createOrder` : entre les
      // deux, on connaît l'id fournisseur sans l'avoir encore enregistré. Si
      // cette écriture-là échoue, l'incertitude doit survivre.
      await prisma.order.updateMany({
        where: { id: order.id, sinaliteSubmitUncertainAt: poseAt },
        data: { sinaliteSubmitUncertainAt: null },
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
      // ⚠️ LA PÉREMPTION NE RÈGLE RIEN À ELLE SEULE : au bout de 5 minutes
      // elle REND le droit de recliquer. C'est le marqueur DURABLE
      // `sinaliteSubmitUncertainAt`, posé quelques lignes plus haut, qui
      // prend le relais — lui ne s'efface que sur preuve ou sur geste humain.
      // (Un commentaire précédent renvoyait ici à un « ticket séparé » : il
      // datait d'avant ce lot, qui l'implémente.)
      //
      // Mais `sinalite.createOrder` lève AUSSI avant tout paquet. Deux cas
      // seulement sont reconnus par ce test, et c'est VOLONTAIREMENT écrit
      // ainsi plutôt que « tous les échecs pré-envoi » :
      //   ✓ configuration invalide      → `SinaliteError(…, '<config>')`
      //   ✓ `/auth/token` en 401         → `SinaliteError(…, '/auth/token')`
      //   ✓ `/auth/token` en TIMEOUT     → idem, status 0 (corrigé à la racine
      //                                     dans `sinalite/client.ts`)
      //   ✓ corps ou schéma de jeton illisible → idem, status 0
      //   ✗ validation locale du payload → `ZodError`, non reconnue
      // Le dernier CONSERVE le verrou ET le marqueur. Fail-closed, donc sans
      // risque d'argent — mais depuis ce lot la sanction n'est plus « cinq
      // minutes d'attente », c'est un blocage jusqu'à geste humain. À traiter
      // si ça se voit en production.
      //
      // Le cas qui compte est couvert : identifiants fournisseur expirés,
      // l'échec de rejeu le plus banal. Ne pas libérer condamnait l'admin à un
      // 409 « rejeu déjà en cours » pendant cinq minutes, sur une route dont
      // l'objet est justement de réessayer.
      const preEnvoi =
        err instanceof SinaliteError && err.endpoint !== '/order/new';

      // ⚠️ LISTE BLANCHE, ET SURTOUT PAS LA PLAGE 4xx ENTIÈRE.
      // Un jet précédent déduisait « aucune commande n'existe » de
      // `status >= 400 && status < 500`. C'est faux pour au moins deux codes,
      // et ce sont précisément ceux qui coûtent cher :
      //   - 409 signifie LITTÉRALEMENT « existe déjà » — donc une commande a
      //     été créée, peut-être par notre propre envoi précédent ;
      //   - 429 est posable à n'importe quelle couche, y compris APRÈS que la
      //     requête ait été traitée.
      // Les relâcher effaçait le marqueur SANS alerte et rendait le bouton
      // cliquable dans la seconde : deuxième production.
      //
      // Ne figurent ici que les codes qui prouvent un refus AVANT création.
      // Dans le doute, on garde le marqueur : la sanction d'un faux négatif
      // est une impression payée deux fois, celle d'un faux positif quelques
      // minutes d'attente.
      const REFUS_AVANT_CREATION = [400, 401, 403, 404, 413, 422];
      const refusRecu =
        err instanceof SinaliteError &&
        err.endpoint === '/order/new' &&
        REFUS_AVANT_CREATION.includes(err.status);
      // `idFournisseur === null` explicite : aujourd'hui ces deux drapeaux ne
      // peuvent pas coexister avec un id connu, mais c'est un accident
      // d'implémentation, pas un invariant. Le rendre explicite empêche qu'un
      // futur remaniement libère un verrou après un envoi abouti.
      if (idFournisseur === null && (preEnvoi || refusRecu)) {
        // Rien n'est parti : ni verrou ni incertitude n'ont lieu d'être.
        await prisma.order.updateMany({
          where: { id: order.id, sinaliteSubmitUncertainAt: poseAt },
          data: { sinaliteSubmitUncertainAt: null },
        });
        await libererVerrou();
      } else if (idFournisseur !== null && !enregistre) {
        // La soumission a RÉUSSI mais l'id n'a pas été persisté (transaction
        // annulée). On tente de le rattacher — c'est la seule chose qui
        // empêche un second envoi — et on ne lève le marqueur QUE si ça marche.
        // ⚠️ `sinaliteOrderId` est `@unique` : si ce numéro est DÉJÀ rattaché
        // à une autre commande, Prisma lève P2002. Sans ce filet, l'exception
        // sortait du `catch` et on perdait TOUT — l'événement, l'alerte et
        // l'audit — sur un 500 nu, précisément dans le cas où la trace compte
        // le plus.
        let rattache = { count: 0 };
        try {
          rattache = await prisma.order.updateMany({
            where: { id: order.id, sinaliteOrderId: null },
            data: { sinaliteOrderId: String(idFournisseur) },
          });
        } catch (e) {
          log.error(
            { orderId: order.id, sinaliteOrderId: idFournisseur, err: e },
            'rejeu sinalite : rattachement de l’id impossible',
          );
        }
        if (rattache.count > 0) {
          await prisma.order.updateMany({
            where: { id: order.id, sinaliteSubmitUncertainAt: poseAt },
            data: { sinaliteSubmitUncertainAt: null },
          });
        }
        // ⚠️ ALERTE D'ABORD, ÉVÉNEMENT ENSUITE. La cause la plus probable du
        // rollback qui nous amène ici est une base indisponible — mettre
        // l'écriture DB avant l'alerte plaçait le SEUL canal indépendant de la
        // DB derrière une écriture DB. Si l'`orderEvent.create` lève,
        // l'exception sort du `catch` et l'alerte n'est jamais envoyée.
        await sendCriticalAlert({
          severity: 'critical',
          title: 'Rejeu Sinalite : soumis, enregistrement ÉCHOUÉ',
          body:
            `Commande ${order.id} — soumission RÉUSSIE (fournisseur #${idFournisseur}) mais ` +
            `l'enregistrement a échoué. Rattachement automatique : ` +
            `${rattache.count > 0 ? 'OK' : 'ÉCHOUÉ — rattacher à la main'}. ` +
            'Ne PAS relancer : la production est lancée.',
        });
        await prisma.orderEvent.create({
          data: {
            orderId: order.id,
            kind: 'SINALITE_SUBMIT_UNCERTAIN',
            data: JSON.stringify({
              sinaliteOrderId: idFournisseur,
              rattache: rattache.count > 0,
              raison: err instanceof Error ? err.message.slice(0, 300) : 'inconnue',
            }),
          },
        });
      } else if (idFournisseur !== null) {
        // ⚠️ L'ISSUE N'EST PAS INCONNUE : la soumission a RÉUSSI et on a son
        // numéro. Ce qui a échoué, c'est une écriture postérieure
        // (`markOrderSubmitted`, le courriel). Crier « la réponse n'est jamais
        // revenue » serait faux, et bloquerait la commande derrière une
        // vérification de portail qui n'a aucun lieu d'être.
        await prisma.order.updateMany({
          where: { id: order.id, sinaliteSubmitUncertainAt: poseAt },
          data: { sinaliteSubmitUncertainAt: null },
        });
        // Ici l'id EST enregistré : `route.ts` bloquera tout reclic sur
        // `order.sinaliteOrderId`. Seule une écriture annexe a échoué (le
        // courriel de confirmation). `warning` et non `critical` : crier au
        // feu pour un courriel use l'attention qu'on veut garder intacte pour
        // les vraies pertes d'argent.
        await sendCriticalAlert({
          severity: 'warning',
          title: 'Rejeu Sinalite : soumis et enregistré, courriel non envoyé',
          body:
            `Commande ${order.id} — soumission et enregistrement OK (fournisseur ` +
            `#${idFournisseur}). Seule une écriture annexe a échoué. Aucun risque de ` +
            'double production ; le client n\'a peut-être pas reçu sa confirmation.',
        });
      } else {
        // L'envoi a PEUT-ÊTRE eu lieu. Le marqueur reste, et un humain doit
        // le savoir maintenant — pas dans cinq minutes quand la péremption
        // rendra le bouton cliquable.
        await prisma.orderEvent.create({
          data: {
            orderId: order.id,
            kind: 'SINALITE_SUBMIT_UNCERTAIN',
            data: JSON.stringify({
              raison: err instanceof Error ? err.message.slice(0, 300) : 'inconnue',
            }),
          },
        });
        await sendCriticalAlert({
          severity: 'critical',
          title: 'Rejeu Sinalite : soumission partie sans réponse',
          body:
            `Commande ${order.id} — /order/new a été émis, la réponse n'est jamais revenue. ` +
            "La commande existe PEUT-ÊTRE chez le fournisseur. Vérifie au portail Sinalite AVANT " +
            "de relancer : le bouton restera bloqué tant qu'un humain n'aura pas levé l'incertitude.",
        });
      }

      const reason =
        err instanceof Error ? err.message : "Sinalite replay failed";
      // Audit admin 2026-07 §8.3 — ne PAS dégrader une commande valide. Avant, un
      // hoquet transitoire Sinalite (503, timeout) pendant un replay de rattrapage
      // faisait basculer une commande PAID en FAILED : l'action de RATTRAPAGE
      // empirait l'état (fausse alerte « Échecs », email d'échec possible). On ne
      // marque FAILED que si la commande l'était déjà ; sinon on conserve le statut
      // et on trace l'échec dans la timeline (OrderEvent ERROR) + l'audit.
      // ⚠️ ET JAMAIS quand la soumission a RÉUSSI. `markOrderSubmitted` a pu
      // écrire `SUBMITTED` avant que l'échec survienne (courriel, écriture
      // suivante) : marquer FAILED ici RÉTROGRADE une commande dont la
      // production est lancée, et `ALLOWED_PRIOR_STATUSES.FAILED` autorise
      // SUBMITTED→FAILED, donc rien ne l'arrête.
      if (order.status === "FAILED" && idFournisseur === null) {
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
