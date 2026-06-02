/**
 * faqSlug — slug partagé /api/search (href /help#slug) ↔ HelpSearch (id du
 * <details>). Round 6 #3. Si ces deux-là divergent, le deep-link search → FAQ
 * casse silencieusement, donc on verrouille le contrat ici.
 */

import { describe, it, expect } from 'vitest';
import { faqSlug } from '@/lib/help/faq-slug';

describe('faqSlug', () => {
  it('minuscule + tirets, sans accents', () => {
    expect(faqSlug('Combien de temps prend la livraison ?')).toBe('combien-de-temps-prend-la-livraison');
  });

  it('retire les accents (NFD)', () => {
    expect(faqSlug('Délai de réclamation ?')).toBe('delai-de-reclamation');
  });

  it('pas de tiret en tête/fin, collapse des séparateurs', () => {
    expect(faqSlug('  Quels  formats ?!  ')).toBe('quels-formats');
  });

  it('déterministe (même entrée → même slug)', () => {
    const q = 'Êtes-vous une vraie imprimerie ?';
    expect(faqSlug(q)).toBe(faqSlug(q));
    expect(faqSlug(q)).toBe('etes-vous-une-vraie-imprimerie');
  });

  it('borné à 80 caractères', () => {
    expect(faqSlug('a'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});
