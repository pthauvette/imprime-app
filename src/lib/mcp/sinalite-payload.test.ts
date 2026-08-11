import { describe, it, expect } from 'vitest';
import { buildMcpSinalitePayload } from './sinalite-payload';
import { SinaliteOrderRequest, type CaProvince, type ShipMethod } from '@/lib/sinalite/types';

const detailCache = new Map<number, { options: { id: number; group: string; name: string }[]; pricing: unknown[]; metadata: unknown[] }>([
  [2, {
    options: [
      { id: 30, group: 'Stock', name: '14pt' },
      { id: 5, group: 'size', name: '3.5x2' },
      { id: 203, group: 'qty', name: '500' },
    ],
    pricing: [],
    metadata: [],
  }],
]);

const base = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detailCache: detailCache as any,
  contact: { firstName: 'Jean', lastName: 'Tremblay', email: 'ship@client.ca', phone: '5145551234' },
  shippingAddress: { line1: '123 rue X', city: 'Montréal', province: 'QC' as CaProvince, postalCode: 'H2X1Y7' },
  shippingMethod: 'UPS Standard' as ShipMethod,
};

describe('buildMcpSinalitePayload', () => {
  it('résout optionId → groupe, injecte le fichier front, remplit ship/bill', () => {
    const payload = buildMcpSinalitePayload({
    artworkFallbacks: [],
      ...base,
      items: [{ productId: 2, optionIds: [30, 5, 203], fileUrl: 'https://plio-uploads.s3.ca-central-1.amazonaws.com/uploads/u1/abc-front.pdf' }],
    });
    expect(payload.items[0].options).toEqual({ Stock: '30', size: '5', qty: '203' });
    expect(payload.items[0].files).toEqual([{ type: 'front', url: 'https://plio-uploads.s3.ca-central-1.amazonaws.com/uploads/u1/abc-front.pdf' }]);
    expect(payload.shippingInfo.ShipEmail).toBe('ship@client.ca'); // contact = ShipEmail (livraison)
    expect(payload.shippingInfo.ShipMethod).toBe('UPS Standard');
    expect(payload.shippingInfo.ShipState).toBe('QC');
    expect(payload.billingInfo.BillCity).toBe('Montréal'); // billing défaut = shipping
  });

  it('internalRef → extra', () => {
    const payload = buildMcpSinalitePayload({
    artworkFallbacks: [],
      ...base,
      items: [{ productId: 2, optionIds: [30], fileUrl: 'https://x/uploads/a.pdf', internalRef: 'PO-42' }],
    });
    expect(payload.items[0].extra).toBe('PO-42');
  });

  it('le payload produit est VALIDE contre le schéma SinaliteOrderRequest', () => {
    const payload = buildMcpSinalitePayload({
    artworkFallbacks: [],
      ...base,
      shippingNote: 'Sonner à l\'interphone',
      items: [{ productId: 2, optionIds: [30, 5, 203], fileUrl: 'https://plio-uploads.s3.ca-central-1.amazonaws.com/uploads/u1/a.pdf' }],
    });
    expect(() => SinaliteOrderRequest.parse(payload)).not.toThrow();
    // Le préfixe « Livraison: » est ASSUMÉ : le chemin MCP passait le texte
    // client brut, sans plafond ni nettoyage, là où le checkout web composait
    // déjà. Les deux partagent désormais `composerNotes` — l'atelier lit la
    // même chose quelle que soit la porte d'entrée de la commande.
    expect(payload.notes).toBe('Livraison: Sonner à l\'interphone');
  });
});
