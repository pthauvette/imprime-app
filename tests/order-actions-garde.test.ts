/**
 * Les gardes CLIENT de la fiche de commande admin.
 *
 * POURQUOI CE FICHIER. Une campagne de mutation a montré que `OrderActions.tsx`
 * n'a AUCUN test, alors qu'il porte la logique qui empêche le mauvais clic :
 * quel bouton est actif, et lequel des deux encadrés s'affiche. Deux mutations
 * survivaient au gate complet — sortir `router.refresh()` du `finally`, et
 * retirer `Boolean(submitUncertainAt)` du `disabled`.
 *
 * ⚠️ TEST STATIQUE, à la manière de `require-phone-coverage`. `vitest.config`
 * tourne en `environment: 'node'` sans bibliothèque de rendu interactif : on ne
 * peut pas simuler un clic. On verrouille donc la FORME du code — moins
 * satisfaisant qu'un test de comportement, mais très supérieur à rien sur des
 * gardes dont l'échec se paie en production imprimée deux fois.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(__dirname, '..', 'src', 'components', 'admin', 'OrderActions.tsx'),
  'utf8',
);
const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('la vue se rafraîchit même quand le rejeu ÉCHOUE', () => {
  it('`router.refresh()` est dans le `finally`, pas dans le chemin de succès', () => {
    // Un rejeu qui échoue a pu ÉCRIRE : le marqueur d'incertitude est posé
    // AVANT l'appel. Ne rafraîchir que sur succès laissait l'admin devant une
    // erreur brute et un bouton toujours actif — l'UI fabriquait le mauvais
    // geste, même si le serveur refuse ensuite en 409.
    const finallyBloc = sansCommentaires.match(/\}\s*finally\s*\{([\s\S]*?)\n\s{4}\}/);
    expect(finallyBloc, 'bloc finally introuvable').toBeTruthy();
    expect(finallyBloc![1]).toContain('router.refresh()');
  });

  it("n'appelle pas `router.refresh()` ailleurs dans `call()`", () => {
    // Deux appels feraient un double rendu à chaque action.
    expect([...sansCommentaires.matchAll(/router\.refresh\(\)/g)]).toHaveLength(1);
  });
});

describe('le bouton de rejeu est désactivé quand il doit l’être', () => {
  const disabled = (() => {
    const m = sansCommentaires.match(/onClick=\{handleReplay\}[\s\S]*?disabled=\{([^}]*)\}/);
    expect(m, 'bouton de rejeu introuvable').toBeTruthy();
    return m![1]!;
  })();

  it('sur une incertitude de soumission', () => {
    // Le serveur refuse déjà, mais un bouton actif invite au clic — et c'est
    // exactement le geste qui a produit une double production au tour d'avant.
    expect(disabled).toContain('submitUncertainAt');
  });

  it('pendant un envoi ENCORE EN VOL', () => {
    expect(disabled).toContain('enVol');
  });

  it('sur les conditions préexistantes', () => {
    expect(disabled).toContain('canReplay');
  });
});

describe('les deux encadrés sont MUTUELLEMENT exclusifs', () => {
  it('« en cours » exige `enVol`, « sans réponse » exige `!enVol`', () => {
    // Afficher « la réponse n'est jamais revenue » pendant les 25 s où l'appel
    // est en vol, c'est mentir — et proposer alors la levée détruisait le
    // verrou de la requête en cours.
    expect(sansCommentaires).toMatch(/submitUncertainAt && !hasSinaliteId && enVol &&/);
    expect(sansCommentaires).toMatch(/submitUncertainAt && !hasSinaliteId && !enVol &&/);
  });

  it('aucun des deux ne s’affiche sur une commande DÉJÀ soumise', () => {
    const encadres = [...sansCommentaires.matchAll(/\{submitUncertainAt && ([^&]*&&)?\s*!hasSinaliteId/g)];
    expect(encadres.length).toBeGreaterThanOrEqual(2);
  });

  it('le seuil vient de la source PARTAGÉE, pas d’un nombre en dur', () => {
    // Un seuil client divergent du serveur afficherait « en cours » quand le
    // serveur considère le verrou périmé, ou l'inverse.
    expect(sansCommentaires).toContain('PEREMPTION_VERROU_MS');
    expect(sansCommentaires).not.toMatch(/enVol[\s\S]{0,120}5\s*\*\s*60/);
  });
});

describe('l’encadré distingue « on sait » de « on ne sait pas »', () => {
  it('le texte « peut-être » est réservé au cas où le numéro est INCONNU', () => {
    // Quand le fournisseur a répondu et que seul l'enregistrement a échoué, la
    // production est lancée — c'est CERTAIN. Afficher « peut-être » envoyait
    // l'admin fouiller le portail pour un chiffre qu'on avait sous la main.
    // ⚠️ DÉCOUPAGE PAR MARQUEURS, pas par regex non-gourmande : `[\s\S]*?)`
    // s'arrête à la PREMIÈRE parenthèse fermante, qui est à l'intérieur du
    // JSX. Le premier jet de ce test découpait donc au mauvais endroit et
    // échouait sur du code correct.
    const debut = sansCommentaires.indexOf('numeroFournisseurConnu ? (');
    expect(debut, 'branche ternaire de l’encadré introuvable').toBeGreaterThan(-1);
    const sep = sansCommentaires.indexOf('\n          ) : (\n', debut);
    expect(sep, 'séparateur de la ternaire introuvable').toBeGreaterThan(-1);
    const fin = sansCommentaires.indexOf('\n          )}\n', sep);
    const siConnu = sansCommentaires.slice(debut, sep);
    const siInconnu = sansCommentaires.slice(sep, fin);

    expect(siConnu).not.toContain('peut-être');
    expect(siConnu).toContain('production est lancée');
    expect(siInconnu).toContain('peut-être');
  });

  it('« rien au portail » n’est PAS proposé quand le numéro est connu', () => {
    // Ce n'est plus une issue possible : la commande EST au portail. L'offrir
    // invitait à attester une fausseté, puis à relancer.
    expect(sansCommentaires).toMatch(
      /\{!numeroFournisseurConnu && \([\s\S]{0,400}?Rien au portail/,
    );
  });

  it('le formulaire de rattachement est PRÉ-REMPLI avec le numéro connu', () => {
    expect(sansCommentaires).toMatch(
      /setAttachId\(numeroFournisseurConnu \? String\(numeroFournisseurConnu\) : ''\)/,
    );
  });
});

describe('le remboursement est offert sur une commande à vérifier', () => {
  it('la règle est DÉLÉGUÉE à une fonction pure, pas réécrite ici', () => {
    // La revue money-path a relevé, à raison, que l'assertion ci-dessous lisait
    // le TEXTE SOURCE : elle passait sur `… && (…) && false`. La règle vit
    // maintenant dans `remboursementProposable`, éprouvée pour de vrai dans
    // `tests/orders-client-verification.test.ts`. Ce qu'on verrouille ici, c'est
    // qu'elle n'a pas été RÉÉCRITE en dur dans le composant.
    expect(sansCommentaires).toContain('const canRefund = remboursementProposable(');
    expect(sansCommentaires).not.toMatch(/const canRefund =[\s\S]{0,200}status !== 'FAILED'/);
  });

});
