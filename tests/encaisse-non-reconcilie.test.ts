/**
 * L'argent encaissé qu'aucun tableau financier ne comptait.
 *
 * POURQUOI CE FICHIER. Le dashboard, l'export et le rapport de taxes excluent
 * `CANCELLED`/`FAILED` du brut ET de leurs remboursements — le raisonnement
 * suppose qu'une commande voidée a été RENDUE. Depuis #583, c'est faux dans le
 * cas devenu NORMAL : une soumission partie sans réponse laisse `FAILED` avec
 * l'argent conservé à dessein, parce que la production est peut-être lancée.
 *
 * ⚠️ LE SENS D'ERREUR EST LE SUJET DE CE FICHIER. Un premier jet déléguait à
 * `refundAmountCentsOf`, dont le repli rend le TOTAL de la commande quand le
 * montant est illisible : un remboursement partiel legacy de 200 $ sur 890 $
 * comptait 890 $, et les 690 $ détenus disparaissaient. Le test correspondant
 * assertait `0` en décrivant ça comme un « repli » correct — il verrouillait
 * l'extinction de l'alarme. Pour un écart de caisse, la seule erreur tolérable
 * est de SUR-signaler.
 */
import { describe, it, expect } from 'vitest';
import { calculerNonReconcilie, type CommandeVoidee } from '@/lib/finances/encaisse-non-reconcilie';

const cmd = (o: Partial<CommandeVoidee> = {}): CommandeVoidee => ({
  id: 'o1',
  status: 'FAILED',
  amountCents: 5000,
  paidAt: new Date('2026-08-15'),
  events: [],
  ...o,
});

const refund = (cents: number) => ({ kind: 'REFUND_ISSUED', data: JSON.stringify({ amountCents: cents }) });
/** Event `REFUND_ISSUED` antérieur au fix #10.6 : aucun montant exploitable. */
const refundLegacy = () => ({ kind: 'REFUND_ISSUED', data: JSON.stringify({ refundId: 're_x' }) });
const fraisAnnulation = (cents: number) =>
  ({ kind: 'ERROR', data: JSON.stringify({ action: 'manual-cancel', cancelFeeCents: cents }) });

describe('ce qui compte comme argent retenu', () => {
  it('encaissée, jamais remboursée → tout le montant est retenu', () => {
    const r = calculerNonReconcilie([cmd()]);
    expect(r.totalRetenuCents).toBe(5000);
    expect(r.lignes).toHaveLength(1);
  });

  it('⚠️ JAMAIS ENCAISSÉE → ignorée, quel que soit le statut', () => {
    // Une commande FAILED faute de 3-D Secure n'a jamais encaissé un sou.
    // La compter gonflerait le chiffre d'un montant qui n'a jamais existé.
    expect(calculerNonReconcilie([cmd({ paidAt: null })]).totalRetenuCents).toBe(0);
  });

  it('entièrement remboursée → rien à réconcilier', () => {
    expect(calculerNonReconcilie([cmd({ events: [refund(5000)] })]).totalRetenuCents).toBe(0);
  });

  it('remboursement PARTIEL → seul le reste est retenu', () => {
    const r = calculerNonReconcilie([cmd({ events: [refund(2000)] })]);
    expect(r.totalRetenuCents).toBe(3000);
    expect(r.lignes[0]).toMatchObject({ encaisseCents: 5000, rembourseCents: 2000, retenuCents: 3000 });
  });

  it('remboursements MULTIPLES → sommés', () => {
    expect(calculerNonReconcilie([cmd({ events: [refund(1000), refund(1500)] })]).totalRetenuCents).toBe(2500);
  });
});

describe('⚠️ un montant de remboursement ILLISIBLE ne doit pas éteindre l’alarme', () => {
  it('event legacy sans `amountCents` → la ligne SURVIT, marquée incertaine', () => {
    // Le premier jet comptait le total de la commande comme remboursé, donc
    // `retenu = 0`, donc ligne écartée. C'est l'inverse du comportement voulu.
    const r = calculerNonReconcilie([cmd({ events: [refundLegacy()] })]);
    expect(r.totalRetenuCents).toBe(5000);
    expect(r.lignes[0]!.montantIncertain).toBe(true);
    expect(r.contientIncertain).toBe(true);
  });

  it('`data` nul → même traitement (la colonne est nullable)', () => {
    const r = calculerNonReconcilie([cmd({ events: [{ kind: 'REFUND_ISSUED', data: null }] })]);
    expect(r.totalRetenuCents).toBe(5000);
    expect(r.lignes[0]!.montantIncertain).toBe(true);
  });

  it('`data` malformé → même traitement', () => {
    const r = calculerNonReconcilie([cmd({ events: [{ kind: 'REFUND_ISSUED', data: '{cassé' }] })]);
    expect(r.totalRetenuCents).toBe(5000);
    expect(r.lignes[0]!.montantIncertain).toBe(true);
  });

  it('un remboursement LISIBLE + un illisible → le lisible compte, la ligne reste marquée', () => {
    const r = calculerNonReconcilie([cmd({ events: [refund(2000), refundLegacy()] })]);
    expect(r.totalRetenuCents).toBe(3000);
    expect(r.lignes[0]!.montantIncertain).toBe(true);
  });

  it('aucun montant illisible → pas de drapeau', () => {
    expect(calculerNonReconcilie([cmd({ events: [refund(1000)] })]).contientIncertain).toBe(false);
  });
});

describe('⚠️ les frais d’annulation sont du revenu ACQUIS, pas un écart', () => {
  it('annulation facturée → seul le reliquat compte, pas les frais', () => {
    // 340 $ encaissés, 50 $ de frais retenus, 290 $ remboursés → rien à faire.
    // Sans cette soustraction, la ligne rouge restait À VIE : aucune action
    // admin ne peut la fermer, puisque les frais sont dus.
    const r = calculerNonReconcilie([
      cmd({ amountCents: 34000, events: [refund(29000), fraisAnnulation(5000)] }),
    ]);
    expect(r.totalRetenuCents).toBe(0);
  });

  it('frais couvrant TOUTE la charge → aucun refund Stripe, et toujours zéro écart', () => {
    // `cancel` n'émet alors ni remboursement ni `REFUND_ISSUED` : sans lecture
    // des frais, la commande ENTIÈRE s'affichait comme retenue.
    const r = calculerNonReconcilie([cmd({ amountCents: 5000, events: [fraisAnnulation(5000)] })]);
    expect(r.totalRetenuCents).toBe(0);
  });

  it('frais partiels + remboursement manquant → l’écart réel ressort', () => {
    const r = calculerNonReconcilie([cmd({ amountCents: 34000, events: [fraisAnnulation(5000)] })]);
    expect(r.totalRetenuCents).toBe(29000);
    expect(r.lignes[0]!.fraisRetenusCents).toBe(5000);
  });
});

describe('⚠️ un sur-remboursement ne doit PAS compenser une autre commande', () => {
  it('la ligne négative est ÉCARTÉE, pas soustraite du total', () => {
    const r = calculerNonReconcilie([
      cmd({ id: 'trop', events: [refund(9000)] }),   // rendu 9000 sur 5000
      cmd({ id: 'retenu' }),                          // 5000 réellement retenus
    ]);
    expect(r.totalRetenuCents).toBe(5000);
    expect(r.lignes.map((l) => l.id)).toEqual(['retenu']);
  });
});

describe('présentation', () => {
  it('le plus gros écart vient en PREMIER', () => {
    const r = calculerNonReconcilie([
      cmd({ id: 'petit', amountCents: 1000 }),
      cmd({ id: 'gros', amountCents: 9000 }),
      cmd({ id: 'moyen', amountCents: 4000 }),
    ]);
    expect(r.lignes.map((l) => l.id)).toEqual(['gros', 'moyen', 'petit']);
  });

  it('aucune commande → total nul, aucune ligne, aucun drapeau', () => {
    expect(calculerNonReconcilie([])).toEqual({ lignes: [], totalRetenuCents: 0, contientIncertain: false });
  });

  it('les deux statuts voidés sont couverts', () => {
    const r = calculerNonReconcilie([cmd({ id: 'a', status: 'FAILED' }), cmd({ id: 'b', status: 'CANCELLED' })]);
    expect(r.totalRetenuCents).toBe(10000);
    expect(r.lignes.map((l) => l.status).sort()).toEqual(['CANCELLED', 'FAILED']);
  });
});

describe('le scénario que ce module existe pour attraper', () => {
  it('la soumission sans réponse ressort au milieu du bruit d’annulations facturées', () => {
    // 140 annulations légitimement facturées + une soumission Sinalite de
    // 4 200 $ partie sans réponse. Sans la soustraction des frais, les 140
    // lignes de bruit noyaient la seule qui comptait.
    const bruit = Array.from({ length: 140 }, (_, i) =>
      cmd({ id: `annul${i}`, amountCents: 34000, events: [refund(29000), fraisAnnulation(5000)] }),
    );
    const r = calculerNonReconcilie([
      ...bruit,
      cmd({ id: 'sinalite', amountCents: 420000 }),
    ]);
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0]!.id).toBe('sinalite');
    expect(r.totalRetenuCents).toBe(420000);
  });
});

describe('R2 — le module ne soustrait des frais que depuis les events ERROR', () => {
  it('un kind inattendu ne soustrait RIEN, même s’il porte `cancelFeeCents`', () => {
    // Le premier jet avait un `else` nu : correct tant que la requête ne
    // remonte que `ERROR`, donc un couplage implicite entre deux fichiers.
    const r = calculerNonReconcilie([
      cmd({ events: [{ kind: 'SINALITE_STATUS_CHANGED', data: JSON.stringify({ cancelFeeCents: 5000 }) }] }),
    ]);
    expect(r.totalRetenuCents).toBe(5000);
  });
});

describe('⚠️ CE QUE LE CHIFFRE NE PEUT PAS VOIR — sous-estimation connue', () => {
  it('un remboursement ENREGISTRÉ mais ÉCHOUÉ chez Stripe fait disparaître la ligne', () => {
    // `markRefundIssued` est appelé à la CRÉATION du remboursement. Si Stripe
    // le passe ensuite à `failed` (carte fermée, banque qui refuse le retour),
    // l'argent revient chez Plio et rien n'amende l'événement — il n'existe
    // aucun handler `charge.refund.updated`.
    //
    // Ce test ne « verrouille » pas un bon comportement : il DOCUMENTE une
    // limite réelle, pour qu'elle ne soit pas redécouverte comme une surprise.
    // Le vrai correctif est le handler manquant, hors de ce lot ; en attendant,
    // l'encadré dit explicitement que le chiffre peut sous-estimer.
    const r = calculerNonReconcilie([cmd({ amountCents: 89000, events: [refund(89000)] })]);
    expect(r.totalRetenuCents).toBe(0);
    expect(r.contientIncertain).toBe(false);
  });
});

/**
 * Rapprochement des remboursements ANNULÉS par Stripe.
 *
 * `markRefundIssued` écrit à la CRÉATION du refund. Un `REFUND_FAILED`
 * (webhook `charge.refund.updated`) dit que celui-ci n'a jamais atterri et que
 * l'argent est revenu chez Plio. Sans ce rapprochement, la ligne calculait
 * `montant − montant = 0` et disparaissait : la seule surface capable de voir
 * cet argent affichait zéro.
 */
describe('un remboursement ANNULÉ par Stripe ne compte plus comme rendu', () => {
  const refundFailed = (id: string, cents: number) =>
    ({ kind: 'REFUND_FAILED', data: JSON.stringify({ refundId: id, amountCents: cents, raison: 'expired_or_canceled' }) });
  const refundAvecId = (id: string, cents: number) =>
    ({ kind: 'REFUND_ISSUED', data: JSON.stringify({ refundId: id, amountCents: cents }) });

  it('⚠️ LE CAS QUI MOTIVE CE LOT : refund intégral créé puis échoué → tout est retenu', () => {
    const r = calculerNonReconcilie([
      cmd({ amountCents: 89000, events: [refundAvecId('re_1', 89000), refundFailed('re_1', 89000)] }),
    ]);
    expect(r.totalRetenuCents).toBe(89000);
  });

  it('un SEUL des deux remboursements échoue → seul celui-là est réintégré', () => {
    const r = calculerNonReconcilie([
      cmd({ amountCents: 10000, events: [
        refundAvecId('re_ok', 4000),
        refundAvecId('re_ko', 6000),
        refundFailed('re_ko', 6000),
      ] }),
    ]);
    expect(r.totalRetenuCents).toBe(6000);
  });

  it('l’échec ne rattache que SON refund, pas les autres', () => {
    const r = calculerNonReconcilie([
      cmd({ amountCents: 10000, events: [refundAvecId('re_ok', 10000), refundFailed('re_autre', 5000)] }),
    ]);
    expect(r.totalRetenuCents).toBe(0);
  });

  it('un REFUND_FAILED sans REFUND_ISSUED correspondant (refund dashboard) n’invente rien', () => {
    const r = calculerNonReconcilie([cmd({ amountCents: 5000, events: [refundFailed('re_x', 5000)] })]);
    expect(r.totalRetenuCents).toBe(5000);
  });

  it('⚠️ un REFUND_FAILED ne doit PAS tomber dans la branche des frais d’annulation', () => {
    // La branche `else` lisait `cancelFeeCents` sur tout événement non-refund :
    // un `REFUND_FAILED` n'en porte pas, donc 0 — mais l'oubli du `continue`
    // rendrait le code dépendant de cette absence.
    const r = calculerNonReconcilie([
      cmd({ amountCents: 5000, events: [{ kind: 'REFUND_FAILED', data: JSON.stringify({ refundId: 're_1', cancelFeeCents: 5000 }) }] }),
    ]);
    expect(r.totalRetenuCents).toBe(5000);
  });

  it('un REFUND_FAILED illisible n’annule personne, et ne fait pas planter', () => {
    const r = calculerNonReconcilie([
      cmd({ amountCents: 5000, events: [refundAvecId('re_1', 5000), { kind: 'REFUND_FAILED', data: '{cassé' }] }),
    ]);
    expect(r.totalRetenuCents).toBe(0);
  });
});

describe('M1 — l’invariant qui rend un doublon inoffensif', () => {
  it('⚠️ DEUX REFUND_FAILED pour le MÊME refund → même résultat qu’un seul', () => {
    // Le garde d'idempotence du handler est une lecture-puis-écriture, donc
    // NON atomique : deux livraisons concurrentes créent deux événements. Ce
    // qui rend ça inoffensif n'est pas le garde, c'est que la réconciliation
    // accumule dans un `Set` et fait un `continue` — jamais une soustraction.
    //
    // Le jour où quelqu'un remplace ce `Set` par une somme, le double-comptage
    // devient réel. Ce test est la seule chose qui s'y oppose.
    const unSeul = calculerNonReconcilie([
      cmd({ amountCents: 89000, events: [
        { kind: 'REFUND_ISSUED', data: JSON.stringify({ refundId: 're_1', amountCents: 89000 }) },
        { kind: 'REFUND_FAILED', data: JSON.stringify({ refundId: 're_1', amountCents: 89000 }) },
      ] }),
    ]);
    const enDouble = calculerNonReconcilie([
      cmd({ amountCents: 89000, events: [
        { kind: 'REFUND_ISSUED', data: JSON.stringify({ refundId: 're_1', amountCents: 89000 }) },
        { kind: 'REFUND_FAILED', data: JSON.stringify({ refundId: 're_1', amountCents: 89000 }) },
        { kind: 'REFUND_FAILED', data: JSON.stringify({ refundId: 're_1', amountCents: 89000 }) },
      ] }),
    ]);
    expect(enDouble.totalRetenuCents).toBe(unSeul.totalRetenuCents);
    expect(enDouble.totalRetenuCents).toBe(89000);
  });
});
