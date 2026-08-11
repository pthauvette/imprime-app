/**
 * Assainissement du payload AVANT envoi au fournisseur.
 *
 * POURQUOI. Le durcissement de `notes`/`extra` (#578) fermait deux portes sur
 * une douzaine. Les champs d'ADRESSE — `line1`, `line2`, `city`, `phone`,
 * `firstName` — sont des `z.string().min(1)` sans nettoyage, saisis par le
 * client, et partaient bruts. Un demi-surrogate orphelin dans n'importe lequel
 * fait refuser le corps ENTIER par le `json_decode` du fournisseur, et l'échec
 * tombe APRÈS encaissement.
 */
import { describe, it, expect } from 'vitest';
import { assainirChaines, bienForme } from '@/lib/sinalite/order-notes';
import { SinaliteOrderRequest } from '@/lib/sinalite/types';

const bienFormee = (s: string) => bienForme(s) === s;

describe('balayage récursif', () => {
  it('assainit une adresse imbriquée', () => {
    const payload = {
      items: [{ productId: 1, options: { qty: '50' }, files: [{ type: 'front', url: 'https://s3/a.pdf' }] }],
      shippingInfo: { ShipAddr2: 'app \uD83D 3', ShipCity: 'Montréal', ShipPhone: '5145551234' },
      billingInfo: { BillFName: 'Ju\uDC4Dlie' },
    };
    const out = assainirChaines(payload);
    expect(bienFormee(out.shippingInfo.ShipAddr2)).toBe(true);
    expect(bienFormee(out.billingInfo.BillFName)).toBe(true);
  });

  it('ne touche à RIEN de valide — accents, emoji, nombres, tableaux', () => {
    const payload = {
      items: [{ productId: 7, options: { qty: '105' }, files: [{ url: 'https://s3/é👍.pdf' }] }],
      shippingInfo: { ShipCity: 'Trois-Rivières', ShipZip: 'H2X 1Y7' },
      total: 4217,
      flag: true,
      rien: null,
    };
    expect(assainirChaines(payload)).toEqual(payload);
  });

  it('préserve la structure : rien ne disparaît, rien ne se déplace', () => {
    // La régression qu'on redoute : un balayage qui reconstruit mal et perd
    // `files` ou `options`. La commande partirait sans fichier, après paiement.
    const payload = {
      items: [
        { productId: 1, options: { Stock: '30', qty: '50' }, files: [{ type: 'front', url: 'u1' }, { type: 'back', url: 'u2' }] },
        { productId: 2, options: { qty: '25' }, files: [{ type: 'front', url: 'u3' }] },
      ],
    };
    const out = assainirChaines(payload);
    expect(out).toEqual(payload);
    expect(out.items[0]!.files).toHaveLength(2);
    expect(out.items[1]!.options).toEqual({ qty: '25' });
  });

  it('laisse intacts les objets à prototype exotique', () => {
    // Les reconstruire par Object.entries les détruirait silencieusement.
    const d = new Date('2026-08-10T00:00:00Z');
    expect(assainirChaines({ quand: d }).quand).toBe(d);
  });

  it.each([null, undefined, 42, true])('%s traversé sans dommage', (v) => {
    expect(assainirChaines(v)).toBe(v);
  });
});

describe('le corps sérialisé devient décodable', () => {
  it('un orphelin dans une adresse ne survit pas à la sérialisation', () => {
    // Avant : JSON.stringify échappait le demi-surrogate en `\ud83d`, le
    // fournisseur rendait JSON_ERROR_UTF16, et la commande — déjà payée —
    // partait en remboursement automatique.
    const brut = JSON.stringify({ ShipAddr2: 'app \uD83D 3' });
    expect(brut).toMatch(/\\ud83d/i);

    const propre = JSON.stringify(assainirChaines({ ShipAddr2: 'app \uD83D 3' }));
    expect(propre).not.toMatch(/\\ud83d/i);
  });
});

describe('sur une vraie sortie de Zod, pas un littéral', () => {
  it('le garde de prototype ne rend pas le balayage inerte', () => {
    // ⚠️ LE test qui compte, et il manquait. `assainirChaines` ne reconstruit
    // que les objets dont le prototype est exactement `Object.prototype`. Si
    // Zod rendait des objets à prototype nul, le balayage serait un NO-OP
    // silencieux — et tous les autres tests, écrits sur des littéraux,
    // resteraient verts.
    const valide = SinaliteOrderRequest.parse({
      items: [{
        productId: 1,
        options: { Stock: '30', qty: '50' },
        files: [{ type: 'front', url: 'https://plio.ca/a.pdf' }],
      }],
      shippingInfo: {
        ShipFName: 'Ju\uD83Dlie', ShipLName: 'Roy', ShipEmail: 'j@plio.ca',
        ShipAddr: '1 rue', ShipCity: 'Montréal', ShipState: 'QC',
        ShipZip: 'H2X 1Y7', ShipCountry: 'CA', ShipPhone: '5145551234',
        ShipMethod: 'UPS Standard',
      },
      billingInfo: {
        BillFName: 'Julie', BillLName: 'Roy', BillEmail: 'j@plio.ca',
        BillAddr: '1 rue', BillCity: 'Montréal', BillState: 'QC',
        BillZip: 'H2X 1Y7', BillCountry: 'CA', BillPhone: '5145551234',
      },
    });

    const out = assainirChaines(valide);
    expect(bienFormee(out.shippingInfo.ShipFName)).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/\\ud83d/i);
    // Et le résultat reste conforme au schéma.
    expect(() => SinaliteOrderRequest.parse(out)).not.toThrow();
  });

  it('assainit aussi les CLÉS', () => {
    const out = assainirChaines({ ['Ta\uD83Dille']: '4' });
    expect(JSON.stringify(out)).not.toMatch(/\\ud83d/i);
  });
});
