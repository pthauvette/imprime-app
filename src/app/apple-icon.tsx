/**
 * Apple touch icon — Audit v2 #10.9.
 *
 * Convention Next.js : un `apple-icon.tsx` à la racine de l'app génère le PNG
 * servi à `/apple-icon` et référencé via <link rel="apple-touch-icon"> dans le
 * <head>. Sans lui, iOS/iPadOS utilisait une capture floue de la page quand un
 * visiteur ajoutait Plio à son écran d'accueil.
 *
 * 180×180 = taille recommandée (iOS la downscale pour les autres densités). Fond
 * PLEIN (pas de transparence ni coins arrondis : iOS applique son propre masque
 * arrondi — un fond transparent donnerait des coins noirs). Reprend le wordmark
 * de src/app/icon.svg : « P » serif crème sur vert Plio.
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1F3D2B',
          color: '#FAFAF7',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 128,
          fontWeight: 700,
          // Léger décalage optique : le « P » serif paraît plus bas centré ainsi.
          lineHeight: 1,
        }}
      >
        P
      </div>
    ),
    size,
  );
}
