'use client';

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * finding [86] — la règle CSS globale `@media (prefers-reduced-motion: reduce)`
 * (globals.css) neutralise déjà les `animation`/`transition` CSS, mais n'a
 * AUCUN effet sur une boucle `requestAnimationFrame`/`useFrame` (Three.js)
 * pilotée en JS — c'est un mécanisme distinct. Ce hook lit la préférence
 * système pour que ce genre d'animation impérative puisse s'auto-désactiver.
 *
 * SSR-safe : renvoie `false` au premier rendu serveur (aucune préférence
 * connue avant hydration) — jamais de throw, jamais de mismatch bloquant.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
