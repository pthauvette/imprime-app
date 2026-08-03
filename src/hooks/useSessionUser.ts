'use client';

/**
 * Sait-on si le visiteur est connecté ? — côté CLIENT uniquement.
 *
 * ⚠️ Pourquoi pas en SSR : le runtime Amplify fuite des rendus entre requêtes,
 * donc on ne rend JAMAIS de session/email côté serveur (cf. la fuite PII de
 * l'en-tête, résolue par `ClientHeaderUserSlot`). Un simple booléen dérivé de la
 * session relève du même interdit : une page mise en cache servirait le rendu
 * « connecté » d'une personne à une autre.
 *
 * Les appels concurrents partagent UNE seule requête (deux composants d'une même
 * page ne doivent pas interroger `/api/auth/session` deux fois). Rien n'est
 * conservé au-delà : un remontage refait la requête, sinon une connexion faite
 * dans un autre onglet resterait invisible.
 */

import { useEffect, useState } from 'react';

interface ReponseSession {
  user?: { email?: string | null } | null;
}

let enVol: Promise<boolean> | null = null;

function lireSession(): Promise<boolean> {
  enVol ??= fetch('/api/auth/session', { credentials: 'include' })
    .then((r) => (r.ok ? (r.json() as Promise<ReponseSession>) : null))
    .then((d) => Boolean(d?.user?.email))
    .catch(() => false)
    .finally(() => { enVol = null; });
  return enVol;
}

/**
 * `null` tant qu'on ne sait pas — à distinguer de `false`. Un appelant qui
 * traite « pas encore chargé » comme « anonyme » fait clignoter l'interface, ou
 * pire, affiche à un client connecté une invitation à se connecter.
 */
export function useSessionUser(): { connecte: boolean | null } {
  const [connecte, setConnecte] = useState<boolean | null>(null);

  useEffect(() => {
    let annule = false;
    lireSession().then((v) => { if (!annule) setConnecte(v); });
    return () => { annule = true; };
  }, []);

  return { connecte };
}
