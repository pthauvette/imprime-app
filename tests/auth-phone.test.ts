/**
 * Normalisation des numéros pour l'auth SMS.
 *
 * L'enjeu n'est pas cosmétique : chaque numéro accepté déclenche un SMS
 * FACTURÉ, et un numéro accepté à tort peut envoyer un code chez un tiers.
 * Les cas de refus comptent donc autant que les cas d'acceptation.
 */

import { describe, it, expect } from 'vitest';
import { normaliserNumero, masquerNumero, messageRefus } from '@/lib/auth/phone';

describe('normaliserNumero', () => {
  it('accepte les formes courantes au Québec', () => {
    // Un client ne devrait pas avoir à deviner un format.
    for (const saisie of [
      '5145550123',
      '514 555-0123',
      '(514) 555-0123',
      '514-555-0123',
      '1-514-555-0123',
      '+1 514 555 0123',
      '  +1 (514) 555-0123  ',
    ]) {
      expect(normaliserNumero(saisie), saisie).toEqual({ ok: true, e164: '+15145550123' });
    }
  });

  it('couvre les indicatifs des grandes régions canadiennes', () => {
    const cas: [string, string][] = [
      ['4165550123', '+14165550123'], // Toronto
      ['6045550123', '+16045550123'], // Vancouver
      ['4185550123', '+14185550123'], // Québec
      ['9025550123', '+19025550123'], // Halifax
      ['8675550123', '+18675550123'], // Territoires
      ['3545550123', '+13545550123'], // Ontario, ouvert en 2023
    ];
    for (const [saisie, attendu] of cas) {
      expect(normaliserNumero(saisie), saisie).toEqual({ ok: true, e164: attendu });
    }
  });

  it('REFUSE les numéros américains — « +1 » ne veut pas dire Canada', () => {
    // Le piège central de ce module : filtrer sur l'indicatif PAYS laisserait
    // passer tout le plan nord-américain, soit ~10× le volume canadien.
    for (const saisie of [
      '2125550123', // New York
      '3105550123', // Los Angeles
      '3125550123', // Chicago
      '+1 415 555 0123', // San Francisco
    ]) {
      expect(normaliserNumero(saisie), saisie).toEqual({ ok: false, raison: 'hors_canada' });
    }
  });

  it('refuse les numéros hors plan nord-américain', () => {
    for (const saisie of ['+33 6 12 34 56 78', '+44 20 7946 0958', '+52 55 1234 5678']) {
      const r = normaliserNumero(saisie);
      expect(r.ok, saisie).toBe(false);
    }
  });

  it('refuse les formats invalides plutôt que de les « réparer »', () => {
    // Deviner l'intention derrière un numéro mal formé, c'est risquer
    // d'envoyer un code chez quelqu'un d'autre.
    for (const saisie of [
      '', '   ', 'abc', '514555', '51455501234567',
      '0145550123', // indicatif régional commençant par 0
      '1145550123', // indicatif régional commençant par 1
      '5140550123', // central commençant par 0
      '5141550123', // central commençant par 1
    ]) {
      expect(normaliserNumero(saisie).ok, JSON.stringify(saisie)).toBe(false);
    }
  });

  it('ne renvoie jamais un e164 malformé quand ok est vrai', () => {
    const entrees = ['5145550123', '(418) 555-0199', '1 867 555 0100'];
    for (const e of entrees) {
      const r = normaliserNumero(e);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.e164).toMatch(/^\+1[2-9]\d{2}[2-9]\d{6}$/);
    }
  });
});

describe('masquerNumero', () => {
  it('ne laisse que les 4 derniers chiffres', () => {
    // Un numéro complet est une donnée personnelle (Loi 25) : il ne doit pas
    // atteindre CloudWatch.
    expect(masquerNumero('+15145550123')).toBe('••• ••• 0123');
    expect(masquerNumero('+15145550123')).not.toContain('514');
  });
});

describe('messageRefus', () => {
  it('oriente vers le courriel quand le pays est en cause', () => {
    // Un client canadien à l'étranger ne doit pas rester coincé sans issue.
    expect(messageRefus('hors_canada')).toMatch(/courriel/i);
  });

  it('ne divulgue aucun détail technique', () => {
    for (const r of ['vide', 'format', 'hors_canada'] as const) {
      const m = messageRefus(r);
      expect(m).not.toMatch(/NANP|E\.164|regex|undefined/i);
      expect(m.length).toBeGreaterThan(10);
    }
  });
});
