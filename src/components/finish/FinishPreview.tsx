'use client';

/**
 * Wrapper de chargement pour l'aperçu 3D des finitions (#5).
 *
 * Charge `FinishPreview3D` via `next/dynamic({ ssr: false })` → Three.js reste
 * hors du SSR et hors du bundle principal (chargé à la demande côté client).
 * Dégrade proprement si WebGL est indisponible (vieux mobile, GPU bloqué).
 */

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { FinishPreview3DProps } from './FinishPreview3D';

const FinishPreview3D = dynamic(() => import('./FinishPreview3D'), {
  ssr: false,
  loading: () => <Placeholder label="Aperçu 3D…" height={280} />,
});

function Placeholder({ label, height }: { label: string; height: number }) {
  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: 12,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg-sunken, #f3f1ec)',
        color: 'var(--text-muted, #6b6a64)',
        fontSize: 13,
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {label}
    </div>
  );
}

/** Détection WebGL — l'aperçu 3D n'a aucun intérêt (et planterait) sans. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return (
      typeof window !== 'undefined' &&
      !!window.WebGLRenderingContext &&
      !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export default function FinishPreview(props: FinishPreview3DProps) {
  // null = pas encore mesuré (évite un flash de fallback au montage SSR→client).
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(hasWebGL()), []);

  const height = props.height ?? 280;
  if (supported === false) {
    return <Placeholder label="Aperçu 3D non disponible sur cet appareil." height={height} />;
  }
  if (supported === null) {
    return <Placeholder label="Aperçu 3D…" height={height} />;
  }
  return <FinishPreview3D {...props} />;
}
