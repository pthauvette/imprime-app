/**
 * `get_custom_quote_info` + le renvoi depuis le catalogue.
 *
 * Ce qui est verrouillé ici est une propriété de DÉCOUVRABILITÉ, pas un calcul :
 * un agent ne doit plus pouvoir conclure « Plio ne fait pas de coroplast » en
 * lisant le catalogue libre-service. C'est arrivé (2026-08) sur un chiffrage de
 * campagne électorale, et ça a fait exclure les pancartes de pelouse — le
 * premier poste d'affichage — d'un plan par ailleurs correct.
 */
import { describe, it, expect } from 'vitest';
import { getCustomQuoteInfo, formatCustomQuoteText } from '@/lib/mcp/tools/custom-quote';
import { listPrintProducts, formatProductsText } from '@/lib/mcp/tools/list-products';
import { CAS_SUR_MESURE } from '@/lib/products/custom-quote';

describe('get_custom_quote_info', () => {
  it('nomme le coroplast — le mot que l’agent avait cherché en vain', () => {
    const txt = formatCustomQuoteText(getCustomQuoteInfo());
    expect(txt.toLowerCase()).toContain('coroplast');
  });

  it('rend TOUS les cas de la page /quote, sans divergence possible', () => {
    // Source unique : si quelqu'un ajoute une famille à la page, elle apparaît
    // ici automatiquement. C'est tout l'intérêt de l'extraction.
    expect(getCustomQuoteInfo().cas).toHaveLength(CAS_SUR_MESURE.length);
    expect(getCustomQuoteInfo().cas.map((c) => c.title)).toEqual(CAS_SUR_MESURE.map((c) => c.title));
  });

  it('renvoie vers /quote et annonce qu’il ne crée RIEN', () => {
    const info = getCustomQuoteInfo();
    expect(info.url).toMatch(/\/quote$/);
    const txt = formatCustomQuoteText(info);
    expect(txt).toContain(info.url);
    expect(txt).toMatch(/ne crée aucune demande/i);
  });

  it('prévient qu’il n’y a PAS de prix instantané', () => {
    // Sans ça, un agent pourrait attendre un chiffre et présenter le silence
    // comme une indisponibilité.
    expect(formatCustomQuoteText(getCustomQuoteInfo())).toMatch(/pas calculables sur-le-champ|devis/i);
  });
});

describe('list_print_products', () => {
  it('dit explicitement que le catalogue n’est PAS toute l’offre', () => {
    const txt = formatProductsText(listPrintProducts());
    expect(txt).toContain('get_custom_quote_info');
    expect(txt.toLowerCase()).toContain('coroplast');
  });

  it('liste toujours les familles libre-service', () => {
    const txt = formatProductsText(listPrintProducts());
    expect(txt).toContain('slug: flyers');
    expect(listPrintProducts().length).toBeGreaterThan(10);
  });
});
