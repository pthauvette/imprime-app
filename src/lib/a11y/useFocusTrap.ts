'use client';

/**
 * useFocusTrap — piège le focus clavier dans un conteneur (modal/dialog) tant
 * qu'il est ouvert, puis restaure le focus sur l'élément déclencheur à la
 * fermeture. Round 7 #1.
 *
 * Avant : OnboardingTour, CommandPalette, FloatingHelpButton, UserMenu (etc.)
 * n'avaient aucun focus-trap → au clavier, Tab sortait derrière l'overlay (le
 * contenu sous le modal restait atteignable), et la fermeture ne rendait pas le
 * focus au bouton d'origine. Inutilisable au clavier / lecteur d'écran.
 *
 * Usage :
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFocusTrap(ref, open);
 *   return open ? <div ref={ref} role="dialog" aria-modal="true">…</div> : null;
 *
 * - À l'ouverture : focus le 1er élément focusable (sinon le conteneur lui-même).
 * - Tab / Shift+Tab bouclent à l'intérieur du conteneur.
 * - À la fermeture (active → false, ou démontage) : restaure le focus sur
 *   l'élément qui avait le focus juste avant l'ouverture (le déclencheur).
 */

import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    // Élément à re-focusser à la fermeture (le déclencheur).
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function focusables(): HTMLElement[] {
      if (!container) return [];
      return Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    }

    // Focus initial : 1er focusable, sinon le conteneur (rendu focusable).
    const initial = focusables()[0];
    if (initial) {
      initial.focus();
    } else {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !container) return;
      const f = focusables();
      if (f.length === 0) {
        e.preventDefault();
        return;
      }
      const first = f[0]!;
      const last = f[f.length - 1]!;
      const activeEl = document.activeElement;
      // Si le focus a fui hors du conteneur, on le ramène.
      if (!container.contains(activeEl)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restaure le focus sur le déclencheur (s'il est toujours dans le DOM).
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active, ref]);
}
