'use client';

import { useEffect, useRef } from 'react';
import { wrapFocusIndex } from '@/lib/a11y/focus-trap';

/**
 * A11y de modal réutilisable (Audit v2 #9.1/#9.4) : quand `active` passe à true,
 *   - Escape ferme (appelle `onClose`),
 *   - Tab / Shift+Tab cyclent DANS le dialog (focus-trap, via wrapFocusIndex),
 *   - le focus est restauré à l'élément déclencheur à la fermeture.
 *
 * Retourne un `ref` à poser sur le CONTENEUR du dialog (celui qui contient les
 * éléments focusables). Extrait de useConfirmDialog pour que les autres modals
 * (ShippingEditButton, AddressForm, etc.) partagent le même comportement.
 */
export function useModalFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null);
  // onClose peut changer à chaque render — on le lit via ref pour ne pas
  // re-attacher le listener (et re-capturer le focus déclencheur) inutilement.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const trigger = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;

    const focusables = (): HTMLElement[] => {
      const node = ref.current;
      if (!node) return [];
      return Array.from(
        node.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const els = focusables();
        if (els.length === 0) return;
        const idx = els.indexOf(document.activeElement as HTMLElement);
        const target = wrapFocusIndex(idx, els.length, e.shiftKey);
        if (target !== null) {
          e.preventDefault();
          els[target]?.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus?.();
    };
  }, [active]);

  return ref;
}
