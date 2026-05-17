/**
 * Persistence localStorage de l'adresse de livraison + contact.
 *
 * Complète le cart store : quand un user fait le wizard multi-item, le
 * shipping address persiste entre les passages. Au 2e produit, /order/
 * shipping pré-remplit avec les valeurs précédentes — pas de re-saisie.
 *
 * Auto-cleared au /order/confirmation pareil que le cart.
 */

const STORAGE_KEY = 'plio.ship.v1';

export interface SavedShip {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
}

export function readSavedShip(): SavedShip | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    // Defensive : on accept un object avec au moins firstName/email/city/province
    if (typeof parsed.firstName !== 'string') return null;
    if (typeof parsed.email !== 'string') return null;
    return {
      firstName: parsed.firstName ?? '',
      lastName: parsed.lastName ?? '',
      email: parsed.email ?? '',
      phone: parsed.phone ?? '',
      line1: parsed.line1 ?? '',
      line2: parsed.line2 ?? '',
      city: parsed.city ?? '',
      province: parsed.province ?? 'QC',
      postalCode: parsed.postalCode ?? '',
    };
  } catch {
    return null;
  }
}

export function writeSavedShip(ship: SavedShip): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ship));
  } catch {
    // QuotaExceeded ou storage disabled — silently ignore
  }
}

export function clearSavedShip(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const SHIP_STORAGE_KEY = STORAGE_KEY;
