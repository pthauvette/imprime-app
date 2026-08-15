/**
 * La FORME de l'encadré « encaissé non réconcilié » sur /admin/finances.
 *
 * ⚠️ TEST STATIQUE, faute de mieux : `vitest.config` tourne en
 * `environment: 'node'` et le dépôt n'a NI React Testing Library NI jsdom
 * installés (vérifié : `require.resolve` échoue sur les deux). Rendre un
 * Server Component asynchrone demanderait deux dépendances de plus.
 *
 * Ce qu'on verrouille ici est précisément ce qu'un test de comportement sur le
 * module PURE ne peut pas voir : la bannière de troncature était IMBRIQUÉE
 * dans le bloc rendu sous `totalRetenuCents > 0`. Une fenêtre saturée de
 * lignes à écart nul donnait donc total = 0 → section absente → bannière
 * absente. Un zéro silencieux, exactement ce que la bannière existe pour
 * empêcher.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(__dirname, '..', 'src', 'app', 'admin', 'finances', 'page.tsx'),
  'utf8',
);
const sansCommentaires = source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('la section se rend AUSSI quand la vue tronque', () => {
  it('la condition d’affichage inclut `vueTronquee`, pas seulement le total', () => {
    expect(sansCommentaires).toContain(
      '{(nonReconcilie.totalRetenuCents > 0 || vueTronquee) && (',
    );
  });

  it('`vueTronquee` compare l’échantillon au COMPTE RÉEL, pas au plafond', () => {
    // Comparer au plafond raterait le cas où les deux requêtes rendent moins
    // que `take` chacune mais que leur somme masque quand même des candidats.
    expect(sansCommentaires).toContain(
      'const vueTronquee = commandesVoidees.length < totalCandidats;',
    );
  });
});

describe('les candidats sont cherchés là où le bruit ne peut pas entrer', () => {
  it('une requête isole les commandes SANS aucun remboursement', () => {
    // C'est là que vit le cas #583 (jamais remboursée) : par construction,
    // aucune ligne à écart nul ne peut consommer ce budget.
    expect(sansCommentaires).toContain("events: { none: { kind: 'REFUND_ISSUED' } }");
  });

  it('⚠️ le tri est par MONTANT, jamais par date', () => {
    // `paidAt desc` faisait périmer le plus ancien écart non réglé — l'inverse
    // exact de « un écart de caisse ne se périme pas ». Et un gros écart
    // pouvait être chassé de la fenêtre par des petits plus récents.
    expect(sansCommentaires).toContain("orderBy: { amountCents: 'desc' }");
    expect(sansCommentaires).not.toMatch(/orderBy: \{ paidAt: 'desc' \}[\s\S]{0,120}PLAFOND_RECONCILIATION/);
  });
});

describe('la copie ne promet pas une précision que la base n’a pas', () => {
  it('ne présente PAS le chiffre comme une borne supérieure', () => {
    // Faux dans les deux sens : un remboursement enregistré peut avoir ÉCHOUÉ
    // chez Stripe ensuite (aucun handler `charge.refund.updated`), et l'argent
    // revient chez Plio sans que rien ne l'indique.
    expect(sansCommentaires).not.toContain('Borne supérieure');
    expect(sansCommentaires).toContain('Estimation, pas un solde');
  });

  it('nomme les DEUX sens d’erreur', () => {
    expect(sansCommentaires).toMatch(/SUR-estimer/);
    expect(sansCommentaires).toMatch(/SOUS-estimer/);
  });
});
