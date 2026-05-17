/**
 * Cart store client-side avec persistence localStorage.
 *
 * Pourquoi pas une lib (Zustand/Jotai) : 1 hook < 100 lignes, pas besoin
 * d'une dep externe pour ça. Pas de SSR — le cart vit uniquement dans
 * le browser, donc useState + useEffect sync localStorage suffit.
 *
 * Phase 1 MVP : cart linéaire (array d'items), pas de wishlist / save-for-
 * later. Chaque item = 1 ligne de commande Sinalite. Pas de combine logic
 * (2 items même productId + options = 2 lignes séparées, parce que les
 * fichiers uploadés peuvent être différents).
 *
 * Limite : 10 items max. Au-delà → split en plusieurs commandes via
 * /admin/orders/quick-link.
 */

import { useEffect, useState, useCallback } from 'react';

export interface CartItem {
  /** UUID local, sert de key React + handle pour remove/update. */
  id: string;
  productId: number;
  productName: string;
  /** Option IDs sélectionnées (Stock, qty, size, etc.). */
  optionIds: number[];
  /** Snapshot des labels d'options pour display sans re-fetch Sinalite. */
  optionLabels: string[];
  /** Quantité de tirage (déjà incluse comme option Sinalite, garde pour display). */
  qty: number;
  /** Prix unitaire en cents CAD (snapshot — admin peut adjust avant submit). */
  unitPriceCents: number;
  /** Fichiers déjà uploadés à S3. */
  files: Array<{ type: 'front' | 'back'; url: string }>;
  /** Lien optionnel vers le DesignDraft Plio (template editor). */
  designId?: string;
  /** Timestamp d'ajout pour sorting. */
  addedAt: number;
}

const STORAGE_KEY = 'plio.cart.v1';
const MAX_ITEMS = 10;

function readStorage(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive : filter items qui n'ont pas la shape attendue
    return parsed.filter(
      (it): it is CartItem =>
        typeof it === 'object' && it !== null &&
        typeof it.id === 'string' &&
        typeof it.productId === 'number' &&
        Array.isArray(it.optionIds) &&
        Array.isArray(it.files),
    );
  } catch {
    return [];
  }
}

function writeStorage(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    // Sync cross-tab : autres tabs reçoivent l'event storage
    window.dispatchEvent(new CustomEvent('plio:cart:updated'));
  } catch {
    // QuotaExceededError ou storage disabled — silently ignore
  }
}

export function generateCartItemId(): string {
  return `ci_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Hook React pour interagir avec le cart. Re-render automatique quand
 * le cart change (même cross-tab).
 */
export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => readStorage());

  // Sync entre tabs + reads externes (ex: après navigation)
  useEffect(() => {
    function handler() {
      setItems(readStorage());
    }
    window.addEventListener('storage', handler);
    window.addEventListener('plio:cart:updated', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('plio:cart:updated', handler);
    };
  }, []);

  const add = useCallback((item: Omit<CartItem, 'id' | 'addedAt'>): { ok: true; id: string } | { ok: false; reason: string } => {
    const current = readStorage();
    if (current.length >= MAX_ITEMS) {
      return { ok: false, reason: `Maximum ${MAX_ITEMS} articles par commande. Contacte-nous pour de plus gros volumes.` };
    }
    const newItem: CartItem = {
      ...item,
      id: generateCartItemId(),
      addedAt: Date.now(),
    };
    const next = [...current, newItem];
    writeStorage(next);
    setItems(next);
    return { ok: true, id: newItem.id };
  }, []);

  const remove = useCallback((id: string) => {
    const next = readStorage().filter((it) => it.id !== id);
    writeStorage(next);
    setItems(next);
  }, []);

  const clear = useCallback(() => {
    writeStorage([]);
    setItems([]);
  }, []);

  const subtotalCents = items.reduce((sum, it) => sum + it.unitPriceCents, 0);

  return {
    items,
    count: items.length,
    subtotalCents,
    add,
    remove,
    clear,
    isFull: items.length >= MAX_ITEMS,
  };
}

// Re-export pour utilisation server-side (lecture seule, jamais write)
export const CART_STORAGE_KEY = STORAGE_KEY;
export const CART_MAX_ITEMS = MAX_ITEMS;
