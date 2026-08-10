'use client';

/**
 * Identité visuelle et nommée d'un produit, pour les étapes CLIENT du tunnel.
 *
 * POURQUOI. Mesuré sur le tunnel : à l'étape LIVRAISON — juste avant le
 * paiement — le récapitulatif annonçait « Produit #97 ». Un identifiant interne
 * Sinalite, montré au client au moment où il vérifie ce qu'il achète. À
 * l'étape FICHIERS, il n'y avait aucune identité produit du tout : on demandait
 * de téléverser un fichier sans jamais rappeler pour quel produit.
 *
 * Les deux étapes avaient besoin exactement de la même chose, et aucune ne
 * l'avait. Un hook plutôt que deux `useEffect` recopiés : c'est la divergence
 * entre copies qui a produit la plupart des défauts de ce dépôt.
 *
 * ⚠️ LE NOM VIENT DE `/api/products/[id]`, QUI APPLIQUE MAINTENANT
 * `applyProductOverrides`. Sans ça on afficherait le nom FOURNISSEUR brut
 * (« Business cards 14pt (Profit Maximizer) ») — la fuite déjà fermée deux fois
 * ailleurs (#540, #563). Ne jamais rebrancher ce hook sur `sinalite.getProduct`
 * directement.
 *
 * Rendu DÉGRADÉ, jamais bloquant : tant que le nom n'est pas connu, on ne
 * montre rien plutôt qu'un identifiant interne ou un libellé inventé.
 */

import { useEffect, useState } from 'react';
import {
  mockupForProductName,
  specForProductName,
  type MockupShape,
  type MockupFinish,
} from '@/lib/products/product-mockup';

export interface ProductIdentity {
  /** Nom marketing FR, ou `null` tant qu'on ne le sait pas. */
  nom: string | null;
  shape: MockupShape;
  finish: MockupFinish;
  /** Grammage/épaisseur (« 14PT », « 100LB »), si dérivable du nom. */
  spec: string | undefined;
}

export function useProductIdentity(productId: string | null): ProductIdentity {
  const [nom, setNom] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let annule = false;
    fetch(`/api/products/${productId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (annule) return;
        const n = data?.product?.name;
        if (typeof n === 'string' && n.trim()) setNom(n.trim());
      })
      // Silencieux À DESSEIN : l'identité produit est du confort d'affichage.
      // Une erreur réseau ne doit pas afficher d'alerte au client à deux écrans
      // du paiement, ni empêcher la suite du parcours.
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [productId]);

  const m = mockupForProductName(nom);
  return { nom, shape: m.shape, finish: m.finish, spec: specForProductName(nom) };
}
