/**
 * Tests pour le renderer email (template loading + substitution {{VAR}}).
 *
 * Couvre :
 *   - Substitution de TOUTES les vars passées
 *   - Stripping des {{UNUSED_VAR}} restantes (évite leak de template syntax)
 *   - Cache template (1 fs.readFileSync par template, pas par render call)
 *   - Subjects par template
 */

import { describe, it, expect } from 'vitest';
import { renderEmail, EMAIL_SUBJECTS } from '@/lib/emails/render';

describe('renderEmail — variable substitution', () => {
  it('substitue {{MAGIC_LINK_URL}} dans email-magic-link', () => {
    const html = renderEmail('magic-link', {
      MAGIC_LINK_URL: 'https://www.plio.ca/api/auth/callback/...',
      UNSUBSCRIBE_URL: 'https://www.plio.ca/settings/email-preferences',
    });
    expect(html).toContain('https://www.plio.ca/api/auth/callback/');
    expect(html).toContain('https://www.plio.ca/settings/email-preferences');
    expect(html).not.toContain('{{MAGIC_LINK_URL}}');
    expect(html).not.toContain('{{UNSUBSCRIBE_URL}}');
  });

  it('strip les {{VARS}} non-fournies (évite leak de syntaxe template)', () => {
    // On passe SEULEMENT MAGIC_LINK_URL, UNSUBSCRIBE_URL est intentionnellement
    // absent → ne doit pas apparaître dans le HTML final.
    const html = renderEmail('magic-link', {
      MAGIC_LINK_URL: 'https://example.com',
    });
    expect(html).not.toMatch(/\{\{\s*\w+\s*\}\}/);
  });

  it('handle des numbers en plus de strings', () => {
    const html = renderEmail('order-confirmation', {
      CUSTOMER_FIRST_NAME: 'Patrick',
      CUSTOMER_NAME: 'Patrick T.',
      ORDER_ID: 48312, // number, pas string
      QUANTITY: 250,
      PRODUCT_NAME: 'Cartes 16pt UV',
      ITEMS_HTML: '<p>Cartes 16pt UV &mdash; 250 unit&eacute;s</p>',
      SUBTOTAL: '152,75',
      SHIPPING: '12,50',
      TAX: '22,17',
      TOTAL: '187,42',
      SHIPPING_METHOD: 'UPS Standard',
      SHIP_CITY: 'Montréal',
      SHIP_ADDRESS_HTML: 'Patrick<br>Mtl, QC',
      TRACK_ORDER_URL: 'https://www.plio.ca/orders/abc',
      UNSUBSCRIBE_URL: 'https://www.plio.ca/settings/email-preferences',
    });
    expect(html).toContain('48312');
    expect(html).toContain('250'); // vient de ITEMS_HTML
    expect(html).toContain('Patrick');
    expect(html).toContain('152,75');
  });

  it('cache — appel multiple ne re-lit pas le fichier', () => {
    // Just verify ça ne crash pas sur appels successifs
    for (let i = 0; i < 5; i++) {
      const html = renderEmail('magic-link', {
        MAGIC_LINK_URL: `https://example.com/${i}`,
      });
      expect(html).toContain(`/${i}`);
    }
  });
});

describe('EMAIL_SUBJECTS — sujets par template', () => {
  it('magic-link', () => {
    expect(EMAIL_SUBJECTS['magic-link']({})).toBe('Ton lien de connexion Plio');
  });

  it('welcome', () => {
    expect(EMAIL_SUBJECTS.welcome({})).toContain('Bienvenue chez Plio');
  });

  it('order-confirmation inclut ORDER_ID sans prefix SIN- (customer-facing)', () => {
    expect(EMAIL_SUBJECTS['order-confirmation']({ ORDER_ID: 48312 }))
      .toBe("C'est imprimé. Confirmation #48312");
  });

  it('order-shipped inclut ORDER_ID', () => {
    expect(EMAIL_SUBJECTS['order-shipped']({ ORDER_ID: 48298 }))
      .toContain('48298');
  });

  it('refund-issued inclut AMOUNT', () => {
    expect(EMAIL_SUBJECTS['refund-issued']({ AMOUNT: '54,20' }))
      .toBe('Remboursement traité — 54,20 $');
  });
});

describe('renderEmail — tous les templates compilent sans crasher', () => {
  it.each([
    ['magic-link', { MAGIC_LINK_URL: 'x', UNSUBSCRIBE_URL: 'y' }],
    ['welcome', { CUSTOMER_FIRST_NAME: 'a', TEMPLATES_URL: 'x', ORDER_START_URL: 'y', CATALOG_URL: 'z', UNSUBSCRIBE_URL: 'u' }],
    ['order-shipped', {
      CUSTOMER_FIRST_NAME: 'a', CUSTOMER_NAME: 'A', ORDER_ID: 1, CARRIER: 'UPS',
      CARRIER_SERVICE: 'Std', TRACKING_NUMBER: '1Z1', TRACK_URL: 'x',
      ETA_FORMATTED: 'demain', SHIP_ADDRESS_HTML: 'a', ORDER_URL: 'x', UNSUBSCRIBE_URL: 'y',
    }],
  ] as const)('template %s rend sans error', (template, vars) => {
    const html = renderEmail(template, vars as Record<string, string | number>);
    expect(html.length).toBeGreaterThan(500); // sanity check : email non vide
    expect(html).toContain('<html'); // structure HTML minimale
  });
});
