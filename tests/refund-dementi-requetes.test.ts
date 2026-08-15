/**
 * La FORME des requêtes qui chargent les remboursements.
 *
 * ⚠️ TEST STATIQUE, et le motif est connu : une clause `where` Prisma échappe
 * aux tests dès que le mock rend la fixture directement — le test vérifie ce
 * que le code fait du RÉSULTAT, jamais ce qu'il a DEMANDÉ. Ça touche
 * exactement les garanties money, parce qu'elles vivent dans le filtre.
 *
 * Ici la garantie est temporelle et contre-intuitive : les `REFUND_FAILED`
 * doivent être chargés SANS borne de période. Un remboursement émis en mai
 * peut être démenti en juillet ; borner les démentis sur la fenêtre des
 * émissions les perdrait, et la surface soustrairait un remboursement qui n'a
 * jamais eu lieu.
 *
 * Le corollaire est tout aussi facile à casser : puisque la requête ramène des
 * événements hors période, le filtre temporel DOIT exister côté JS — sinon une
 * commande remboursée en avril puis en mai verrait ses deux remboursements
 * comptés dans le chiffre de mai.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lire = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const sansCommentaires = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const dashboard = sansCommentaires(lire('src', 'app', 'admin', 'finances', 'page.tsx'));
const exportXlsx = sansCommentaires(lire('src', 'app', 'api', 'admin', 'finances', 'export', 'route.ts'));
const taxRoute = sansCommentaires(lire('src', 'app', 'api', 'admin', 'finances', 'tax-report', 'route.ts'));
const taxPage = sansCommentaires(lire('src', 'app', 'admin', 'finances', 'tax-report', 'page.tsx'));
const purge = sansCommentaires(lire('src', 'app', 'api', 'cron', 'purge-old-events', 'route.ts'));

describe('surfaces de gestion — les démentis sont chargés sans borne', () => {
  it.each([
    ['tableau de bord', () => dashboard],
    ['export XLSX', () => exportXlsx],
  ])('%s charge REFUND_ISSUED **et** REFUND_FAILED', (_l, src) => {
    expect(src()).toContain("kind: { in: ['REFUND_ISSUED', 'REFUND_FAILED'] }");
  });

  it.each([
    ['tableau de bord', () => dashboard],
    ['export XLSX', () => exportXlsx],
  ])('%s délègue la somme au helper partagé (filtre temporel inclus)', (_l, src) => {
    // Une somme réécrite en ligne perdrait soit la déduction des démentis,
    // soit le filtre de période — les deux se paient en chiffre faux.
    expect(src()).toContain('sommeRemboursementsValidesCents(');
  });

  it('le tableau de bord ne borne PAS la requête sur createdAt', () => {
    // La borne vit dans le helper. La remettre en SQL perdrait les démentis
    // tardifs, c'est-à-dire le cas qui motive tout le lot.
    expect(dashboard).not.toMatch(/kind: \{ in: \['REFUND_ISSUED', 'REFUND_FAILED'\] \},\s*\n\s*createdAt:/);
  });
});

describe('rapport de taxes — les reprises ne sont PAS filtrées sur les commandes du rapport', () => {
  it.each([
    ['route CSV', () => taxRoute],
    ['écran', () => taxPage],
  ])('%s charge les REFUND_FAILED de la période, toutes commandes', (_l, src) => {
    // La requête est multi-ligne : on vérifie le kind ET l'absence de filtre
    // sur les commandes du rapport, sans dépendre du formatage.
    expect(src()).toMatch(/kind: 'REFUND_FAILED',\s*\n\s*createdAt:/);
    // ⚠️ Filtrer sur `orderId: { in: orderIds }` perdrait EXACTEMENT le cas
    // visé : la commande de mai n'est pas dans le rapport de juillet.
    expect(src()).not.toMatch(/kind: 'REFUND_FAILED',[\s\S]{0,80}orderId: \{ in:/);
  });

  it('⚠️ les DEUX requêtes filtrent sur PAID_STATUSES', () => {
    // Sans ce filtre, une commande CANCELLED/FAILED entrait dans l'assiette
    // TPS/TVQ par la porte de derrière — alors qu'elle n'y a JAMAIS été, et
    // que c'est la population DOMINANTE des `REFUND_FAILED` (l'échec Sinalite
    // auto-remboursé est le chemin FAILED le plus fréquent du système).
    for (const src of [taxRoute, taxPage]) {
      const occurrences = [...src.matchAll(/order: \{ status: \{ in: \[\.\.\.PAID_STATUSES\] \} \}/g)];
      expect(occurrences).toHaveLength(2); // REFUND_ISSUED + REFUND_FAILED
    }
  });

  it('⚠️ les remboursements ne sont PLUS filtrés sur les commandes du rapport', () => {
    // La soustraction doit être aussi inconditionnelle que l'ajout : sinon un
    // remboursement sur commande hors période n'est déduit de RIEN pendant que
    // sa reprise est ajoutée, et la taxe est déclarée deux fois.
    for (const src of [taxRoute, taxPage]) {
      expect(src).not.toMatch(/kind: 'REFUND_ISSUED', orderId: \{ in: orderIds \}/);
    }
  });

  it('écran et export passent tous deux les reprises au helper', () => {
    // La garantie « écran == export » est écrite dans le code ; elle casse en
    // silence si un seul des deux reçoit les reprises.
    expect(taxRoute).toContain('computeTaxReport(orders, refundEvents, repriseEvents)');
    expect(taxPage).toContain('computeTaxReport(orders, refundEvents, repriseEvents)');
  });
});

describe('purge — les kinds financiers ne sont jamais supprimés', () => {
  it('le delete ET le count excluent les kinds financiers', () => {
    // Compter sans exclure donnerait un chiffre d'audit faux, et laisserait
    // croire que la purge a fait plus que ce qu'elle a fait.
    const occurrences = [...purge.matchAll(/kind: \{ notIn: \[\.\.\.KINDS_FINANCIERS\] \}/g)];
    expect(occurrences).toHaveLength(2);
  });

  it('la liste couvre les trois kinds qui portent un mouvement d’argent', () => {
    expect(purge).toContain("const KINDS_FINANCIERS = ['REFUND_ISSUED', 'REFUND_FAILED', 'PAYMENT_DISPUTED']");
  });
});
