/**
 * Commandes voidées dont l'argent encaissé n'a peut-être jamais été rendu.
 *
 * POURQUOI CE FICHIER. Le dashboard finances, l'export XLSX et le rapport de
 * taxes excluent tous `CANCELLED` et `FAILED` — du brut ET de leurs
 * remboursements, à dessein : une vente voidée n'est pas un revenu, et compter
 * son remboursement la soustrairait deux fois (cf. `PAID_STATUSES`).
 *
 * Ce raisonnement suppose qu'une commande voidée a été RENDUE. C'est vrai dans
 * le cas nominal, et faux dans exactement les cas qui coûtent de l'argent :
 * soumission partie sans réponse (#583, argent conservé à dessein), refus
 * prouvé dont le remboursement automatique a échoué, annulation dont le
 * remboursement a échoué.
 *
 * ⚠️ CE MODULE NE TOUCHE PAS AU CALCUL DU REVENU. Rouvrir `CANCELLED/FAILED`
 * dans les agrégations casserait la sémantique « vente voidée » pour les
 * VRAIES ventes voidées, qui sont la majorité. On ajoute le tableau qui
 * manquait plutôt que de fausser celui qui existe.
 *
 * ═══ CE QUE CE CHIFFRE EST, ET CE QU'IL N'EST PAS ═══════════════════════
 *
 * ⚠️ C'EST UNE BORNE SUPÉRIEURE, PAS UN SOLDE. La base ne peut pas connaître
 * les remboursements émis depuis le DASHBOARD STRIPE — ils ne produisent aucun
 * `OrderEvent`. Or c'est précisément la remédiation que nos propres alertes
 * recommandent (« rembourse à la main ») dans deux des trois cas ci-dessus.
 * La seule source de vérité est `stripe.refunds.list({ payment_intent })`,
 * qu'utilise `/api/admin/orders/[id]/refund` — trop coûteuse pour un rendu de
 * page (un appel réseau par commande candidate).
 *
 * Conséquence assumée : ce tableau SUR-SIGNALE. Une ligne peut être déjà
 * réglée au dashboard. C'est le bon sens d'erreur pour un écart de caisse —
 * une ligne à vérifier est actionnable, une ligne absente ne l'est pas.
 *
 * Un premier jet faisait exactement l'INVERSE et s'éteignait tout seul : il
 * déléguait à `refundAmountCentsOf`, dont le REPLI rend le total de la commande
 * quand `data` ne porte pas de montant (events legacy pré-#10.6, ou `data`
 * nul). Un remboursement PARTIEL de 200 $ sur 890 $ comptait donc 890 $, et
 * les 690 $ réellement détenus disparaissaient — sur un jeu de trois
 * commandes, sans attendre la moindre montée en charge. Le test censé
 * verrouiller ce comportement le décrivait comme correct.
 */

/** Statuts où une commande est réputée voidée — donc hors du revenu. */
export const STATUTS_VOIDES = ['CANCELLED', 'FAILED'] as const;

/** Événement pertinent : un remboursement, ou l'annulation qui a retenu des frais. */
export interface EvenementFinancier {
  kind: string;
  data: string | null;
}

export interface CommandeVoidee {
  id: string;
  status: string;
  amountCents: number;
  /** `null` = jamais encaissée : il n'y a rien à réconcilier. */
  paidAt: Date | null;
  events: EvenementFinancier[];
}

export interface LigneNonReconciliee {
  id: string;
  status: string;
  encaisseCents: number;
  /** Ce qu'on SAIT avoir été remboursé. Jamais un repli optimiste. */
  rembourseCents: number;
  /** Frais d'annulation retenus — du revenu acquis, pas un écart. */
  fraisRetenusCents: number;
  /** Borne SUPÉRIEURE de l'écart. */
  retenuCents: number;
  /** Un remboursement existe mais son montant est illisible → la borne est large. */
  montantIncertain: boolean;
}

function nombre(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Somme, par commande, ce qui a été encaissé et pas manifestement rendu.
 *
 * ⚠️ `paidAt` EST LE DISCRIMINANT, PAS LE STATUT. Une commande `FAILED` faute
 * de 3-D Secure n'a jamais encaissé un sou : la compter gonflerait le chiffre
 * d'un montant qui n'a jamais existé, et le tableau perdrait toute crédibilité
 * dès la première lecture.
 *
 * ⚠️ LES FRAIS D'ANNULATION SONT SOUSTRAITS. `/api/admin/orders/[id]/cancel`
 * rembourse `amountCents − cancelFeeCents` puis marque FAILED avec `paidAt`
 * posé : sans cette soustraction, chaque annulation FACTURÉE laissait une
 * ligne rouge permanente qu'aucune action ne peut fermer — les frais sont dus.
 * Et quand les frais couvrent toute la charge, il n'y a AUCUN remboursement
 * Stripe ni aucun événement : la commande entière s'affichait comme retenue.
 * Cent lignes de bruit légitime auraient noyé la seule qui comptait.
 *
 * ⚠️ UN SUR-REMBOURSEMENT NE COMPENSE RIEN : le garde `retenuCents <= 0`
 * ÉCARTE la ligne au lieu de la soustraire du total. On compte le cash retenu,
 * pas un solde net. (Un `Math.max(0, …)` doublonnait ce garde ; une campagne
 * de mutation l'a montré MORT, et le garder laissait croire à deux protections
 * là où il n'y en a qu'une.)
 */
export function calculerNonReconcilie(commandes: CommandeVoidee[]): {
  lignes: LigneNonReconciliee[];
  totalRetenuCents: number;
  /** Au moins une ligne repose sur un montant de remboursement illisible. */
  contientIncertain: boolean;
} {
  const lignes: LigneNonReconciliee[] = [];
  for (const c of commandes) {
    if (c.paidAt === null) continue;

    let rembourseCents = 0;
    let fraisRetenusCents = 0;
    let montantIncertain = false;

    for (const e of c.events) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = e.data ? (JSON.parse(e.data) as Record<string, unknown>) : {};
      } catch {
        parsed = {};
      }
      if (e.kind === 'REFUND_ISSUED') {
        const montant = nombre(parsed.amountCents);
        // ⚠️ PAS DE REPLI SUR LE TOTAL DE LA COMMANDE. Un montant illisible
        // veut dire « on ne sait pas », pas « tout a été rendu ». On compte 0
        // et on marque la ligne : la borne est large, et elle est visible.
        if (montant === null) montantIncertain = true;
        else rembourseCents += montant;
      } else if (e.kind === 'ERROR') {
        // Frais retenus par `cancel` (event ERROR, `action: 'manual-cancel'`).
        //
        // ⚠️ `else if` ET NON `else` : un `else` nu soustrayait `cancelFeeCents`
        // de TOUT événement non-`REFUND_ISSUED`. Correct tant que la requête ne
        // remonte que `ERROR` — donc un couplage IMPLICITE entre deux fichiers.
        // Le jour où quelqu'un ajoute un `kind` au `where`, la branche se met à
        // soustraire en silence.
        fraisRetenusCents += nombre(parsed.cancelFeeCents) ?? 0;
      }
    }

    const retenuCents = c.amountCents - rembourseCents - fraisRetenusCents;
    if (retenuCents <= 0) continue;
    lignes.push({
      id: c.id,
      status: c.status,
      encaisseCents: c.amountCents,
      rembourseCents,
      fraisRetenusCents,
      retenuCents,
      montantIncertain,
    });
  }
  // Le plus gros écart en premier : c'est celui qu'on va traiter.
  lignes.sort((a, b) => b.retenuCents - a.retenuCents);
  return {
    lignes,
    totalRetenuCents: lignes.reduce((s, l) => s + l.retenuCents, 0),
    contientIncertain: lignes.some((l) => l.montantIncertain),
  };
}
