/**
 * Transitions de statut du REJEU Sinalite.
 *
 * POURQUOI. Sur le cas d'usage n°1 du rejeu admin — « la commande est FAILED,
 * on relance » — la séquence était la suivante :
 *
 *   1. `sinalite.createOrder` RÉUSSIT : la production réelle est lancée.
 *   2. `markOrderSubmitted` LÈVE, parce que `SUBMITTED` n'acceptait que `PAID`
 *      comme statut antérieur, et la commande est `FAILED`.
 *   3. Le `catch` appelle `markOrderFailed`, qui LÈVE AUSSI : `FAILED` n'était
 *      pas dans ses statuts antérieurs — alors que son propre commentaire
 *      affirmait « Si déjà CANCELLED/FAILED, idempotent skip ».
 *   4. L'exception s'échappe du `catch`, `recordAdminAudit` n'est jamais
 *      atteint.
 *
 * Résultat : un bon de production réel chez le fournisseur, ZÉRO trace dans
 * Plio, un 500 à l'écran, et un bouton qui invite à recliquer.
 *
 * Deux commentaires faux sur le chemin money, et c'est le second qui coûtait le
 * plus cher : un gestionnaire d'erreur qui lève transforme un échec traçable en
 * exception silencieuse.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src: string = readFileSync(join(__dirname, '..', 'src', 'lib', 'db', 'orders.ts'), 'utf8');

function statutsAnterieurs(cible: string): string[] {
  const bloc = src.match(/const ALLOWED_PRIOR_STATUSES[^=]*=\s*\{([\s\S]*?)\n\};/);
  expect(bloc, 'ALLOWED_PRIOR_STATUSES introuvable').toBeTruthy();
  const ligne = bloc![1]!.match(new RegExp(`^\\s*${cible}:\\s*\\[([^\\]]*)\\]`, 'm'));
  expect(ligne, `${cible} introuvable`).toBeTruthy();
  return [...ligne![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
}

describe('le rejeu d’une commande échouée peut aboutir', () => {
  it('FAILED → SUBMITTED est autorisé — mais SEULEMENT via la liste dédiée', () => {
    // Assertion corrigée : la première version cherchait FAILED dans la table
    // PARTAGÉE, ce qui l'aurait aussi ouvert au webhook fournisseur.
    const bloc = src.match(/const PRIORS_SUBMITTED[^=]*=\s*\[([^\]]*)\]/);
    const priors = [...bloc![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
    expect(priors).toContain('FAILED');
  });
});

describe('markOrderFailed est réellement idempotent', () => {
  it('FAILED → FAILED est autorisé', () => {
    // Son commentaire l'affirmait déjà. Le code ne le faisait pas.
    expect(statutsAnterieurs('FAILED')).toContain('FAILED');
  });

  it('mais toujours PAS après expédition', () => {
    // La garde qui compte : on ne marque pas échouée une commande déjà partie.
    expect(statutsAnterieurs('FAILED')).not.toContain('SHIPPED');
    expect(statutsAnterieurs('FAILED')).not.toContain('DELIVERED');
  });
});

describe('les autres transitions ne bougent pas', () => {
  it('PAID n’accepte toujours que PENDING', () => {
    expect(statutsAnterieurs('PAID')).toEqual(['PENDING']);
  });

  it('CANCELLED reste interdit après lancement en production', () => {
    expect(statutsAnterieurs('CANCELLED')).not.toContain('IN_PRODUCTION');
    expect(statutsAnterieurs('CANCELLED')).not.toContain('SHIPPED');
  });
});

describe('B1 — la FSM du chemin FOURNISSEUR n’a pas été ouverte au passage', () => {
  it('la table PARTAGÉE garde SUBMITTED: [PAID] seul', () => {
    // `applySinaliteStatusChange` lit cette table, et `NEW → SUBMITTED`.
    // Y ajouter FAILED pour les besoins du rejeu ADMIN aurait permis à un
    // event `NEW` rejoué depuis /admin/webhooks de faire repasser
    // « en traitement » une commande REMBOURSÉE.
    expect(statutsAnterieurs('SUBMITTED')).toEqual(['PAID']);
  });

  it('le rejeu admin a sa PROPRE liste', () => {
    const bloc = src.match(/const PRIORS_SUBMITTED[^=]*=\s*\[([^\]]*)\]/);
    expect(bloc, 'PRIORS_SUBMITTED introuvable').toBeTruthy();
    const priors = [...bloc![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
    expect(priors).toContain('PAID');
    expect(priors).toContain('FAILED');
  });

  it('markOrderSubmitted utilise la liste dédiée, pas la partagée', () => {
    expect(src).toMatch(/status:\s*\{\s*in:\s*PRIORS_SUBMITTED\s*\}/);
  });
});

describe('B3 — la cause racine de l’échec survit', () => {
  it('l’OrderEvent porte `reason`, pas seulement `data`', () => {
    // `failureReason` est ÉCRASÉ à chaque échec. Maintenant que FAILED→FAILED
    // est permis, un second échec transitoire effacerait la cause utile.
    // `reason` est placé APRÈS le spread : avant, un appelant passant son
    // propre `data.reason` l'aurait écrasé. Et il est borné à 500 comme
    // `failureReason` — non borné, il pouvait franchir la troncature à 2000 et
    // produire un JSON invalide, donc un event qui ne rend PLUS RIEN.
    expect(src).toMatch(/reason:\s*input\.reason\.slice\(0,\s*500\)/);
    expect(src).toMatch(/\.\.\.\(typeof input\.data === 'object'/);
  });
});
