/**
 * Ce que le CLIENT peut lire d'une commande — les deux surfaces.
 *
 * POURQUOI CE FICHIER. La liste des événements internes vivait en dur dans
 * `OrderEventsTimeline.tsx`. La SECONDE surface client — le PDF d'historique
 * téléchargeable — ne la connaissait pas : elle rendait tous les événements,
 * sans filtre de `kind`, avec un repli `?? ev.kind` qui imprimait
 * l'IDENTIFIANT TECHNIQUE.
 *
 * ⚠️ CE N'ÉTAIT PAS THÉORIQUE. `SINALITE_SUBMIT_UNCERTAIN`, livré en #582/#583
 * et DÉPLOYÉ, n'a jamais eu de libellé : un client dont la soumission est
 * partie sans réponse pouvait télécharger un PDF en-tête « Plio · Démocratik
 * inc. » où s'imprimait, en toutes lettres, `SINALITE_SUBMIT_UNCERTAIN`.
 * C'est la régression [49] — déjà corrigée une fois pour `CANCEL_REQUESTED` —
 * rejouée parce que la connaissance n'était pas partagée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENEMENTS_INTERNES, visiblePourClient } from '@/lib/orders/event-visibility';
import { ORDER_EVENT_KIND } from '@/lib/db/orders';
import { LIBELLE_REPLI } from '@/lib/print/timeline-pdf';

describe('la liste des internes', () => {
  it.each(['ERROR', 'SINALITE_SUBMIT_UNCERTAIN', 'SINALITE_SUBMIT_UNCERTAIN_CLEARED', 'REFUND_FAILED', 'PAYMENT_DISPUTED'])(
    '%s est INVISIBLE au client',
    (kind) => {
      expect(visiblePourClient(kind)).toBe(false);
    },
  );

  it.each(['PAYMENT_SUCCEEDED', 'SINALITE_SUBMITTED', 'REFUND_ISSUED', 'CANCEL_REQUESTED'])(
    '%s reste visible (non-régression)',
    (kind) => {
      expect(visiblePourClient(kind)).toBe(true);
    },
  );

  it('ne référence que des kinds RÉELS', () => {
    // Une faute de frappe rendrait un événement interne visible en silence.
    for (const k of EVENEMENTS_INTERNES) {
      expect(ORDER_EVENT_KIND as readonly string[]).toContain(k);
    }
  });
});

describe('⚠️ le PDF ne doit JAMAIS imprimer un identifiant technique', () => {
  const sourcePdf = readFileSync(
    join(__dirname, '..', 'src', 'lib', 'print', 'timeline-pdf.ts'), 'utf8',
  );
  const sourceRoute = readFileSync(
    join(__dirname, '..', 'src', 'app', 'api', 'orders', '[id]', 'timeline.pdf', 'route.ts'), 'utf8',
  );

  it('le repli est un libellé NEUTRE, pas `ev.kind`', () => {
    // C'est le vrai correctif durable : compléter la table à chaque nouveau
    // kind ne suffit pas, puisqu'elle est `Record<string, …>` — tsc ne signale
    // RIEN quand une entrée manque. Le seul remède est que l'oubli ne soit
    // plus lisible.
    expect(sourcePdf).toContain('EVENT_LABELS[ev.kind] ?? LIBELLE_REPLI');
    expect(sourcePdf).not.toMatch(/EVENT_LABELS\[ev\.kind\] \?\? ev\.kind/);
    expect(LIBELLE_REPLI).not.toMatch(/[A-Z]{3,}_/); // aucun identifiant SCREAMING_CASE
  });

  it('la route filtre les internes pour un non-admin', () => {
    expect(sourceRoute).toContain('visiblePourClient(e.kind)');
    // …et passe la liste FILTRÉE au générateur, pas la liste brute.
    expect(sourceRoute).toContain('events: evenements,');
    expect(sourceRoute).not.toContain('events: order.events,');
  });
});
