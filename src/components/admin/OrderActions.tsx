'use client';

/**
 * Action panel pour /admin/orders/[id]. Wired to POST endpoints.
 *
 * Toutes les actions :
 *   - Demandent une confirmation native (prompt pour refund/cancel — capture
 *     reason + amount partial). Pas de modal fancy pour MVP.
 *   - POST l'endpoint correspondant
 *   - Refresh le router pour re-render la page avec les nouveaux events
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { PEREMPTION_VERROU_MS } from '@/lib/orders/replay-lock';
import { referencePlio } from '@/lib/sinalite/order-notes';

interface Props {
  orderId: string;
  status: string;
  amountCents: number;
  hasSinaliteId: boolean;
  /** Nombre d'articles — sert à estimer les frais d'annulation Sinalite (25 $/article). */
  itemsCount?: number;
  /** Audit §8.5 — déjà remboursé (Σ REFUND_ISSUED) : le form refund montre le
   *  RESTANT au lieu de pré-remplir le total (double-refund accidentel). */
  alreadyRefundedCents?: number;
  /**
   * Horodatage « `/order/new` émis, issue inconnue ». Quand il est posé, le
   * rejeu est REFUSÉ côté serveur tant qu'un humain n'a pas vérifié au portail
   * fournisseur. On le montre ici parce qu'un bouton qui refuse sans expliquer
   * envoie l'admin recliquer.
   */
  submitUncertainAt?: string | null;
  /**
   * Horodatage du verrou de rejeu. Sert à distinguer « soumission EN COURS »
   * de « soumission SANS RÉPONSE » — sans lui, l'encadré affirmait la seconde
   * pendant les ~25 s où la première est vraie, et proposait comme unique
   * geste celui qui détruit le verrou de l'appel en vol.
   */
  replayClaimedAt?: string | null;
  /**
   * `paidAt` posé. Sert à n'offrir le remboursement que sur de l'argent
   * RÉELLEMENT encaissé : une commande FAILED faute de 3-D Secure n'a rien à
   * rendre, et proposer le geste ferait échouer l'appel côté Stripe.
   */
  encaissee?: boolean;
  /**
   * Numéro de commande fournisseur retrouvé dans la timeline alors que
   * `sinaliteOrderId` est absent — cas « le fournisseur a répondu, notre
   * enregistrement a échoué ». Quand il est là, l'issue n'est PAS inconnue :
   * la production est lancée, et le geste juste est de rattacher ce numéro,
   * pas d'aller le chercher au portail.
   */
  numeroFournisseurConnu?: number | null;
}

export default function OrderActions({ orderId, status, amountCents, hasSinaliteId, itemsCount = 1, alreadyRefundedCents = 0, submitUncertainAt = null, replayClaimedAt = null, encaissee = false, numeroFournisseurConnu = null }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Round 37 #5 — Custom modal vs window.confirm/prompt (mobile unusable,
  // unbranded). Inline form pour le refund amount au lieu de prompt × 2.
  const { confirm, dialog } = useConfirmDialog();

  // Même seuil que le serveur (`lib/orders/replay-lock.ts`). Tant que le verrou
  // est vivant, l'envoi peut ENCORE aboutir : on ne propose pas de lever.
  const PEREMPTION_MIN = Math.round(PEREMPTION_VERROU_MS / 60_000);
  const enVol =
    replayClaimedAt !== null &&
    Date.now() - new Date(replayClaimedAt).getTime() < PEREMPTION_VERROU_MS;
  // Formulaire de rattachement du numéro fournisseur (issue « je l'ai trouvée
  // au portail » de la vérification exigée par l'encadré).
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachId, setAttachId] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('Geste commercial');
  // Round 40 #5 — Cancel reason inline form (était window.prompt).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Stock épuisé — non disponible');
  // Audit admin 2026-07 §8.1 — répercuter les frais d'annulation Sinalite
  // (l'API cancel accepte chargeCancelFee depuis #433 ; l'UI ne l'exposait pas →
  // Plio absorbait ≥ 25 $/article à chaque annulation post-production).
  const [chargeCancelFee, setChargeCancelFee] = useState(false);
  // Sinalite ne facture qu'une fois la commande partie en production.
  const sinaliteCharged = status === 'SUBMITTED' || status === 'IN_PRODUCTION';
  // Estimation UI (le vrai montant, env-configurable côté serveur, est renvoyé par l'API).
  const estimatedFeeCents = Math.min(amountCents, 2500 * Math.max(1, itemsCount));

  // §8.5 — restant remboursable (le form refund raisonne dessus, pas sur le total).
  const remainingCents = Math.max(0, amountCents - alreadyRefundedCents);
  // ⚠️ `FAILED` N'EST PLUS EXCLU, et c'est une conséquence directe du marqueur
  // d'incertitude. Une soumission partie sans réponse laisse la commande
  // FAILED avec l'argent CONSERVÉ. Si la vérification au portail conclut
  // « rien », l'admin n'avait alors que deux gestes : relancer la production,
  // ou ne rien faire — rembourser n'était offert nulle part, alors que la
  // route l'accepte (elle ne refuse que PENDING). On gardait l'argent d'un
  // client sans produire, et le runbook s'arrêtait là.
  //
  // `encaissee` borne le geste à de l'argent réel : les FAILED du 3-D Secure
  // abandonné (`paidAt` nul) n'ont rien à rendre. Et `remainingCents > 0`
  // écarte tout seul les FAILED déjà remboursées automatiquement, qui sont la
  // population majoritaire.
  const canRefund =
    status !== 'PENDING' && status !== 'CANCELLED' && remainingCents > 0 &&
    (status !== 'FAILED' || encaissee);
  const canReplay = !hasSinaliteId && status !== 'PENDING' && status !== 'CANCELLED';
  const canCancel = status !== 'SHIPPED' && status !== 'DELIVERED' && status !== 'CANCELLED' && status !== 'FAILED';

  // Audit admin 2026-07 §8.2 — faire avancer le fulfillment depuis la fiche
  // (avant : détour obligé par le bulk de la liste). Boutons contextuels au
  // statut ; SHIPPED ouvre un mini-form tracking/carrier.
  const canToProduction = status === 'PAID' || status === 'SUBMITTED';
  const canToShipped = status === 'PAID' || status === 'SUBMITTED' || status === 'IN_PRODUCTION';
  const canToDelivered = status === 'SHIPPED';
  const [shipOpen, setShipOpen] = useState(false);
  const [shipTracking, setShipTracking] = useState('');
  const [shipCarrier, setShipCarrier] = useState('UPS');

  function handleShipSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShipOpen(false);
    void call('Marquée expédiée', `/api/admin/orders/${orderId}/status`, {
      status: 'SHIPPED',
      ...(shipTracking.trim() && { trackingNumber: shipTracking.trim() }),
      ...(shipTracking.trim() && shipCarrier.trim() && { carrier: shipCarrier.trim() }),
    });
  }

  async function call(label: string, path: string, body?: Record<string, unknown>) {
    setBusy(label);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // Audit admin 2026-07 §4.2 — queueEmail retourne { sent:false } en HTTP 200
      // quand l'email est droppé (opt-out / suppression bounce / throttle). Un
      // « ✓ OK » codé en dur mentait à l'admin. On lit `sent` quand il est présent.
      if (typeof data.sent === 'boolean' && !data.sent) {
        setError(`⚠ ${label} : email NON délivré (opt-out, bounce ou throttle). Le client n'a rien reçu — contacte-le autrement.`);
      } else if (typeof data.cancelFeeCents === 'number' && data.cancelFeeCents > 0) {
        // §8.1 — refléter les frais réellement retenus par l'API cancel.
        setSuccess(`✓ ${label} OK — frais d'annulation retenus : ${(data.cancelFeeCents / 100).toFixed(2)} $ · remboursé : ${(data.refundedCents / 100).toFixed(2)} $`);
      } else {
        setSuccess(`✓ ${label} OK`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      // ⚠️ RAFRAÎCHIR AUSSI EN CAS D'ÉCHEC. Un rejeu qui échoue a pu ÉCRIRE
      // en base — le marqueur d'incertitude est posé AVANT l'appel. Ne
      // rafraîchir que sur succès laissait l'admin devant une erreur brute et
      // un bouton toujours actif, alors que le serveur refuse déjà : l'UI
      // fabriquait le mauvais geste.
      router.refresh();
      setBusy(null);
    }
  }

  function handleResend() {
    void call('Email renvoyé', `/api/admin/orders/${orderId}/resend-confirmation`);
  }

  async function handleReplay() {
    const ok = await confirm({
      title: 'Re-soumettre cette commande à Sinalite ?',
      body: 'Crée une nouvelle order côté Sinalite. À utiliser si la première submission a fail ou doit être ré-essayée.',
      confirmLabel: 'Re-soumettre',
    });
    if (!ok) return;
    void call('Replay Sinalite', `/api/admin/orders/${orderId}/replay-sinalite`);
  }

  async function handleLeverIncertitude() {
    const ok = await confirm({
      title: "Lever le blocage « issue inconnue » ?",
      body:
        `Confirme que tu as cherché « ${referencePlio(orderId)} » au portail Sinalite et ` +
        "qu'AUCUNE commande n'y correspond. Cette action est journalisée à ton nom — " +
        "si une commande existe et que tu relances, l'imprimeur produira deux fois.",
      confirmLabel: 'Rien au portail — lever',
    });
    if (!ok) return;
    void call('Lever incertitude', `/api/admin/orders/${orderId}/clear-submit-uncertainty`);
  }

  // ⚠️ LE SECOND GESTE DE LA MÊME VÉRIFICATION. L'encadré demande d'aller
  // regarder le portail ; ça a deux issues, et une seule avait un bouton.
  // L'admin qui TROUVAIT la commande n'avait que de mauvais choix : affirmer
  // par écrit qu'il n'avait rien vu, ou ne rien faire — en laissant une
  // commande en production sans identifiant fournisseur, donc invisible aux
  // webhooks de statut et sans aucun suivi pour le client.
  async function handleRattacherSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numero = attachId.trim();
    if (!/^\d+$/.test(numero)) {
      setError('Numéro fournisseur invalide — chiffres seulement.');
      return;
    }
    setAttachOpen(false);
    const ok = await confirm({
      title: `Rattacher la commande fournisseur #${numero} ?`,
      body:
        `La commande passera « Soumise à la presse » avec le numéro ${numero}, et le rejeu sera ` +
        'bloqué définitivement. À ne faire que si tu as LU ce numéro au portail sur une commande ' +
        `qui correspond à ${referencePlio(orderId)}. Journalisé à ton nom.`,
      confirmLabel: 'Rattacher',
    });
    if (!ok) return;
    void call('Numéro fournisseur rattaché', `/api/admin/orders/${orderId}/attach-sinalite-id`, {
      sinaliteOrderId: numero,
    });
  }

  // Round 37 #5 — handleRefund ouvre maintenant un mini-form inline
  // (refundOpen state) au lieu de window.prompt × 2. Mobile-friendly,
  // validation native HTML, pas de jarring browser dialog.
  function handleRefundOpen() {
    setRefundAmount((remainingCents / 100).toFixed(2));
    setRefundReason('Geste commercial');
    setError(null);
    setSuccess(null);
    setRefundOpen(true);
  }

  async function handleRefundSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!refundReason.trim()) {
      setError('Raison requise');
      return;
    }
    const amountVal = refundAmount.trim();
    const parsedAmount = amountVal === '' ? NaN : parseFloat(amountVal);
    const amountCentsBody = amountVal === '' || isNaN(parsedAmount)
      ? undefined
      : Math.round(parsedAmount * 100);
    setRefundOpen(false);
    void call('Refund émis', `/api/admin/orders/${orderId}/refund`, {
      amountCents: amountCentsBody,
      reason: refundReason.trim(),
    });
  }

  // Round 40 #5 — Cancel reason via inline form (matches refund pattern).
  // Avant : window.prompt mobile-unusable (truncated text, ~25 char visible,
  // no multiline, no styled keyboard). L'audit l'avait flaggé P1 mobile.
  function handleCancelOpen() {
    setCancelReason('Stock épuisé — non disponible');
    setChargeCancelFee(false);
    setError(null);
    setSuccess(null);
    setCancelOpen(true);
  }

  async function handleCancelSubmit(e: React.FormEvent) {
    e.preventDefault();
    const reason = cancelReason.trim();
    if (!reason) {
      setError('Raison requise');
      return;
    }
    setCancelOpen(false);
    const withFee = chargeCancelFee && sinaliteCharged;
    // Garde la confirm modal pour le double-check destructif (mobile-OK).
    const ok = await confirm({
      title: withFee ? 'Annuler la commande (refund moins frais) ?' : 'Annuler la commande + full refund ?',
      body: withFee
        ? `Raison : ${reason}\n\nFrais d'annulation Sinalite retenus (≈ ${(estimatedFeeCents / 100).toFixed(2)} $) — remboursement estimé : ${((amountCents - estimatedFeeCents) / 100).toFixed(2)} $ + crédits restaurés. Le customer sera notifié.`
        : `Raison : ${reason}\n\nLe customer sera notifié + Stripe refund + wallet credit restauré si applicable.`,
      confirmLabel: 'Annuler la commande',
      danger: true,
    });
    if (!ok) return;
    void call('Commande annulée', `/api/admin/orders/${orderId}/cancel`, { reason, chargeCancelFee: withFee });
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <ActionBtn
        label={<><Icon name="mail" /> Renvoyer la confirmation</>}
        onClick={handleResend}
        busy={busy === 'Email renvoyé'}
      />
      {/* ⚠️ AVANT le bouton de rejeu, et non après : un admin qui voit
          « Soumettre » en premier clique, se fait refuser, et ne comprend pas.
          L'explication doit précéder l'action qu'elle bloque. */}
      {submitUncertainAt && !hasSinaliteId && enVol && (
        <div
          style={{
            padding: 12,
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-md)',
            background: 'var(--bg-sunken)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong><Icon name="info" size={14} /> Soumission en cours…</strong>
          <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
            Un envoi est parti il y a moins de {PEREMPTION_MIN} minutes et peut
            encore aboutir. Recharge la page dans un instant — ne lève rien
            maintenant, ça ferait partir une seconde production.
          </div>
        </div>
      )}

      {submitUncertainAt && !hasSinaliteId && !enVol && (
        <div
          style={{
            padding: 12,
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-md)',
            background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
            fontSize: 13,
            lineHeight: 1.5,
            display: 'grid',
            gap: 8,
          }}
        >
          <strong style={{ color: 'var(--danger)' }}>
            <Icon name="alert" size={14} />{' '}
            {numeroFournisseurConnu
              ? 'Production LANCÉE — enregistrement échoué'
              : 'Soumission partie sans réponse'}
          </strong>
          {/* ⚠️ DEUX SITUATIONS, DEUX TEXTES. Le premier jet affichait « la
              commande existe peut-être » dans les deux cas. Quand le
              fournisseur a répondu et que seul notre enregistrement a échoué,
              c'est FAUX — elle existe certainement, et on envoyait l'admin
              chercher au portail un numéro qu'on avait sous la main. */}
          {numeroFournisseurConnu ? (
            <span style={{ color: 'var(--text-secondary)' }}>
              L&apos;imprimeur a répondu le{' '}
              {new Date(submitUncertainAt).toLocaleString('fr-CA')} avec le numéro{' '}
              <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {numeroFournisseurConnu}
              </code>{' '}
              — <strong>la production est lancée</strong> — mais l&apos;enregistrement chez
              nous a échoué. Rattache ce numéro. Ne relance pas, et ne rembourse pas :
              l&apos;imprimeur facturera cette impression.
            </span>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>
              Une soumission a été émise le{' '}
              {new Date(submitUncertainAt).toLocaleString('fr-CA')} et la réponse n&apos;est
              jamais revenue.
              La commande existe <strong>peut-être déjà</strong> chez l&apos;imprimeur. Le rejeu
              est bloqué tant que ce n&apos;est pas vérifié au portail Sinalite.
            </span>
          )}

          {/* ⚠️ LA CLÉ DE CORRÉLATION, MONTRÉE. L'encadré exigeait d'attester
              l'absence d'une commande sans jamais dire SOUS QUEL NOM la
              chercher : `referencePlio` existait et n'était affiché nulle
              part. On demandait une vérification en retenant ce qui permet de
              la faire. Elle est envoyée dans `notes` sur chaque soumission —
              c'est donc bien ce texte qui est cherchable au portail. */}
          <div
            style={{
              display: numeroFournisseurConnu ? 'none' : 'grid',
              gap: 6,
              padding: 10,
              borderRadius: 'var(--r-sm)',
              background: 'var(--bg-sunken)',
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>
              Cherche cette référence dans les notes des commandes au portail :
            </span>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700 }}>
              {referencePlio(orderId)}
            </code>
            <a
              href="https://apifrontend.sinaliteuppy.com/index.php"
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
            >
              Ouvrir le portail Sinalite ↗
            </a>
          </div>

          {/* Les DEUX issues de la vérification, côte à côte. N'en offrir
              qu'une poussait à mentir : voir le commentaire de
              `handleRattacherSubmit`. */}
          {!numeroFournisseurConnu && (
            <ActionBtn
              label={<><Icon name="check" /> Rien au portail — lever le blocage</>}
              onClick={handleLeverIncertitude}
              busy={busy === 'Lever incertitude'}
            />
          )}
          {attachOpen ? (
            <form onSubmit={handleRattacherSubmit} style={{ display: 'grid', gap: 6 }}>
              <label htmlFor="attach-sin" style={{ display: 'block', fontSize: 11, fontWeight: 600 }}>
                Numéro de commande lu au portail
              </label>
              <input
                id="attach-sin"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                autoFocus
                placeholder="123456"
                value={attachId}
                onChange={(e) => setAttachId(e.target.value.replace(/\D/g, ''))}
                style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)' }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setAttachOpen(false)}
                  style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  style={{ padding: '6px 12px', background: 'var(--accent-primary)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Rattacher
                </button>
              </div>
            </form>
          ) : (
            <ActionBtn
              label={
                numeroFournisseurConnu
                  ? <><Icon name="clip" /> Rattacher le n&#176; {numeroFournisseurConnu}</>
                  : <><Icon name="clip" /> Je l&apos;ai trouvée — rattacher son numéro</>
              }
              onClick={() => {
                setAttachId(numeroFournisseurConnu ? String(numeroFournisseurConnu) : '');
                setError(null);
                setAttachOpen(true);
              }}
              busy={busy === 'Numéro fournisseur rattaché'}
            />
          )}
        </div>
      )}

      <ActionBtn
        label={hasSinaliteId ? "↻ Déjà soumis à Sinalite" : "↻ Soumettre à Sinalite"}
        onClick={handleReplay}
        busy={busy === 'Replay Sinalite'}
        disabled={!canReplay || Boolean(submitUncertainAt) || enVol}
      />

      {/* Audit §8.2 — faire avancer le fulfillment depuis la fiche */}
      {(canToProduction || canToShipped || canToDelivered) && (
        <>
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 0' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
            Faire avancer
          </div>
          {canToProduction && (
            <ActionBtn
              label={<><Icon name="settings" /> → En production</>}
              onClick={() => void call('En production', `/api/admin/orders/${orderId}/status`, { status: 'IN_PRODUCTION' })}
              busy={busy === 'En production'}
            />
          )}
          {canToShipped && (
            <ActionBtn
              label={<><Icon name="truck" /> → Expédiée (tracking)…</>}
              onClick={() => { setError(null); setSuccess(null); setShipOpen(true); }}
              busy={busy === 'Marquée expédiée'}
            />
          )}
          {shipOpen && (
            <form
              onSubmit={handleShipSubmit}
              style={{ display: 'grid', gap: 8, padding: 12, background: 'var(--bg-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)', marginTop: 4 }}
            >
              <div>
                <label htmlFor="ship-tracking" style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                  Numéro de tracking (optionnel — envoyé au client + /track)
                </label>
                <input
                  id="ship-tracking"
                  type="text"
                  value={shipTracking}
                  onChange={(e) => setShipTracking(e.target.value)}
                  maxLength={80}
                  placeholder="1Z999AA10123456784"
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)' }}
                />
              </div>
              <div>
                <label htmlFor="ship-carrier" style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                  Transporteur
                </label>
                <input
                  id="ship-carrier"
                  type="text"
                  value={shipCarrier}
                  onChange={(e) => setShipCarrier(e.target.value)}
                  maxLength={40}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShipOpen(false)} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" style={{ padding: '6px 12px', background: 'var(--accent-primary)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Marquer expédiée
                </button>
              </div>
            </form>
          )}
          {canToDelivered && (
            <ActionBtn
              label={<><Icon name="check" /> → Livrée</>}
              onClick={() => void call('Marquée livrée', `/api/admin/orders/${orderId}/status`, { status: 'DELIVERED' })}
              busy={busy === 'Marquée livrée'}
            />
          )}
        </>
      )}

      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 0' }} />
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--danger)',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        Zone dangereuse
      </div>
      <ActionBtn
        label={<><Icon name="dollar" /> Émettre un refund (partial OK)</>}
        onClick={handleRefundOpen}
        busy={busy === 'Refund émis'}
        disabled={!canRefund}
        danger
      />
      {/* Round 37 #5 — Inline form au lieu de window.prompt × 2 (mobile unusable) */}
      {refundOpen && (
        <form
          onSubmit={handleRefundSubmit}
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-md)',
            marginTop: 4,
          }}
        >
          <div>
            <label htmlFor="refund-amount" style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              Montant CAD (restant remboursable : {(remainingCents / 100).toFixed(2)} $)
            </label>
            {alreadyRefundedCents > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                Déjà remboursé : {(alreadyRefundedCents / 100).toFixed(2)} $ / {(amountCents / 100).toFixed(2)} $
              </div>
            )}
            <input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0"
              max={(remainingCents / 100).toFixed(2)}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder={(remainingCents / 100).toFixed(2)}
              style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)' }}
            />
          </div>
          <div>
            <label htmlFor="refund-reason" style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              Raison (audit log) *
            </label>
            <input
              id="refund-reason"
              type="text"
              required
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              maxLength={200}
              style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setRefundOpen(false)}
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              style={{ padding: '6px 12px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Émettre refund
            </button>
          </div>
        </form>
      )}
      <ActionBtn
        label={<><Icon name="x" /> Annuler la commande (refund)</>}
        onClick={handleCancelOpen}
        busy={busy === 'Commande annulée'}
        disabled={!canCancel}
        danger
      />
      {/* Round 40 #5 — Inline cancel-reason form (was window.prompt mobile-unusable) */}
      {cancelOpen && (
        <form
          onSubmit={handleCancelSubmit}
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-md)',
            marginTop: 4,
          }}
        >
          <div>
            <label htmlFor="cancel-reason" style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              Raison de l&apos;annulation (visible client + audit log) *
            </label>
            <textarea
              id="cancel-reason"
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={500}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                fontFamily: 'inherit',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--r-sm)',
                resize: 'vertical',
              }}
            />
          </div>
          {/* Audit §8.1 — frais d'annulation Sinalite, seulement si la commande est
              déjà partie en production (sinon computeCancelFeeCents renvoie 0). */}
          {sinaliteCharged && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={chargeCancelFee}
                onChange={(e) => setChargeCancelFee(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--danger)' }}
              />
              <span>
                <strong>Répercuter les frais d&apos;annulation Sinalite</strong> (≈ 25 $/article ×{' '}
                {Math.max(1, itemsCount)} = ~{(estimatedFeeCents / 100).toFixed(2)} $).
                Remboursement estimé : <strong>{((amountCents - (chargeCancelFee ? estimatedFeeCents : 0)) / 100).toFixed(2)} $</strong>
                {' '}+ crédits restaurés. Décoché = Plio absorbe les frais (full refund).
              </span>
            </label>
          )}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}
            >
              Garder
            </button>
            <button
              type="submit"
              style={{ padding: '6px 12px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Continuer
            </button>
          </div>
        </form>
      )}

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            color: 'var(--danger)',
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: 'var(--success-soft)',
            border: '1px solid var(--success)',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            color: 'var(--success)',
          }}
        >
          {success}
        </div>
      )}
      {dialog}
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  busy,
  disabled,
  danger,
}: {
  label: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      style={{
        textAlign: 'left',
        padding: '8px 12px',
        background: 'transparent',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--r-sm)',
        fontSize: 13,
        color: disabled ? 'var(--text-muted)' : danger ? 'var(--danger)' : 'var(--text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 500,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {busy ? <>⏳ {label}</> : label}
    </button>
  );
}
