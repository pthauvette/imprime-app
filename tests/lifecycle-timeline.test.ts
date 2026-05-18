/**
 * Tests pour renderLifecycleTimeline — mini-timeline 4 étapes inline-styled
 * pour les emails lifecycle. Vérifie que le marquage done/current/pending
 * suit `currentStep` et que le HTML est table-based (compat Gmail/Outlook).
 */

import { describe, it, expect } from 'vitest';
import {
  renderLifecycleTimeline,
  statusToStep,
  DEFAULT_LIFECYCLE_STEPS,
} from '@/lib/emails/lifecycle-timeline';

describe('renderLifecycleTimeline', () => {
  it('rend 4 cellules avec les labels par défaut', () => {
    const html = renderLifecycleTimeline(2);
    expect(html).toContain('Reçue');
    expect(html).toContain('Imprimée');
    expect(html).toContain('Expédiée');
    expect(html).toContain('Livrée');
  });

  it('currentStep=0 → toutes pending (cercle vide bordure grise)', () => {
    const html = renderLifecycleTimeline(0);
    // 4 cellules pending avec couleur #7A8780 sur le label
    const greyLabels = (html.match(/color:#7A8780/g) || []).length;
    expect(greyLabels).toBeGreaterThanOrEqual(4);
    // Aucun checkmark
    expect(html).not.toContain('&check;');
  });

  it('currentStep=3 → 2 done + 1 current + 1 pending', () => {
    const html = renderLifecycleTimeline(3);
    // 2 checkmarks (step 1, 2)
    const checks = (html.match(/&check;/g) || []).length;
    expect(checks).toBe(2);
    // Step 3 (current) montre "3" pas un checkmark
    expect(html).toMatch(/>3</);
    // Step 4 (pending) montre "4"
    expect(html).toMatch(/>4</);
  });

  it('currentStep=4 → 3 done + 1 current (Livrée)', () => {
    const html = renderLifecycleTimeline(4);
    const checks = (html.match(/&check;/g) || []).length;
    expect(checks).toBe(3); // steps 1, 2, 3 done
    expect(html).toMatch(/>4</); // step 4 current (chiffre, pas check)
  });

  it('utilise des <table> et inline styles (compat Gmail/Outlook)', () => {
    const html = renderLifecycleTimeline(2);
    expect(html).toContain('<table');
    expect(html).toContain('cellspacing="0"');
    expect(html).toContain('style=');
    // Pas de <div> au layout level (Gmail strip parfois)
    expect(html).not.toContain('<div');
  });

  it('header "Progression" est présent', () => {
    const html = renderLifecycleTimeline(1);
    expect(html).toContain('Progression');
  });

  it('labels custom via steps param', () => {
    const html = renderLifecycleTimeline(2, [
      { position: 1, label: 'Foo' },
      { position: 2, label: 'Bar' },
      { position: 3, label: 'Baz' },
      { position: 4, label: 'Qux' },
    ]);
    expect(html).toContain('Foo');
    expect(html).toContain('Bar');
    expect(html).toContain('Baz');
    expect(html).toContain('Qux');
    expect(html).not.toContain('Reçue');
  });
});

describe('statusToStep', () => {
  it.each([
    ['PAID', 1],
    ['SUBMITTED', 1],
    ['IN_PRODUCTION', 2],
    ['SHIPPED', 3],
    ['DELIVERED', 4],
    ['CANCELLED', 0],
    ['FAILED', 0],
    ['PENDING', 0],
    ['unknown', 0],
  ] as const)('%s → step %i', (status, expectedStep) => {
    expect(statusToStep(status)).toBe(expectedStep);
  });
});

describe('DEFAULT_LIFECYCLE_STEPS', () => {
  it('expose les 4 étapes par défaut en ordre', () => {
    expect(DEFAULT_LIFECYCLE_STEPS).toHaveLength(4);
    expect(DEFAULT_LIFECYCLE_STEPS.map((s) => s.position)).toEqual([1, 2, 3, 4]);
    expect(DEFAULT_LIFECYCLE_STEPS.map((s) => s.label)).toEqual([
      'Reçue', 'Imprimée', 'Expédiée', 'Livrée',
    ]);
  });
});
