'use client';

/**
 * Client component qui vide le cart + ship localStorage au mount.
 * À mounter sur /order/confirmation pour cleanup post-checkout réussi.
 */

import { useEffect } from 'react';
import { useCart } from '@/lib/cart/store';
import { clearSavedShip } from '@/lib/cart/ship-store';

export default function CartClearOnMount() {
  const cart = useCart();
  useEffect(() => {
    cart.clear();
    clearSavedShip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
