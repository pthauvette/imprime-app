'use client';

/**
 * Client component qui vide le cart localStorage au mount.
 * À mounter sur /order/confirmation pour cleanup post-checkout réussi.
 */

import { useEffect } from 'react';
import { useCart } from '@/lib/cart/store';

export default function CartClearOnMount() {
  const cart = useCart();
  useEffect(() => {
    cart.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
