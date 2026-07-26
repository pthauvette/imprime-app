/**
 * findCategoryGroupBySinaliteCategory — remplace `guessCategorySlug`
 * (ConfigureClient.tsx), qui devinait la famille par sous-chaîne et retombait
 * sur « cartes-de-visite » par défaut pour toute catégorie non reconnue
 * (~44 % du catalogue selon docs/experience-client-2026-07.md finding [13]).
 */

import { describe, it, expect } from 'vitest';
import { CATEGORY_GROUPS, findCategoryGroupBySinaliteCategory } from '@/lib/catalogue';

describe('findCategoryGroupBySinaliteCategory', () => {
  it('résout une catégorie Sinalite exacte vers la bonne famille', () => {
    expect(findCategoryGroupBySinaliteCategory('Business Cards')?.slug).toBe('cartes-de-visite');
    expect(findCategoryGroupBySinaliteCategory('Roll Labels / Stickers')?.slug).toBe('etiquettes');
    expect(findCategoryGroupBySinaliteCategory('NCR Forms')?.slug).toBe('stationnerie');
  });

  it('catégorie inconnue → null (pas de faux positif « cartes-de-visite » par défaut)', () => {
    expect(findCategoryGroupBySinaliteCategory('Something Sinalite Invente Demain')).toBeNull();
  });

  it('chaque sinaliteCategories de CATEGORY_GROUPS se résout vers SA PROPRE famille (pas de collision)', () => {
    for (const group of CATEGORY_GROUPS) {
      for (const cat of group.sinaliteCategories) {
        expect(findCategoryGroupBySinaliteCategory(cat)?.slug).toBe(group.slug);
      }
    }
  });
});
