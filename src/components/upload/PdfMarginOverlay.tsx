'use client';

/**
 * Overlay SVG bleed / trim / safe zone par-dessus le thumbnail PDF rendu
 * dans /order/upload. Aide le customer à vérifier visuellement que ses
 * fichiers respectent les marges de sécurité avant de checkout.
 *
 * Limite MVP : les inset percentages sont hardcoded (5 % bleed, 10 % safe)
 * indépendamment du produit. C'est visuellement correct pour les cartes
 * pro (~0.125" bleed sur 3.5"), grossier pour les flyers (~1.5 % réel).
 * Future enhancement : extraire les vraies dimensions du PDF + spec
 * produit et calculer les insets exacts en %.
 *
 * Légende ci-dessous l'image :
 *   - Rouge : bord du PDF (bleed area — DOIT être imprimable jusqu'au bord)
 *   - Noir solide : ligne de trim (où le papier sera coupé)
 *   - Tirets : zone safe (texte/logo doivent rester à l'intérieur)
 *
 * Use case : un user upload un PDF avec son logo trop près du bord →
 * l'overlay montre clairement que le logo est dans la danger zone et
 * pourrait être coupé en production.
 */

import { useState } from 'react';

interface Props {
  thumbnailDataUrl: string;
  filename: string;
  /** % du bord total occupé par le bleed (defaut 5). */
  bleedPercent?: number;
  /** % du bord total occupé par la zone DANGER (bleed + petite marge safe). Defaut 10. */
  safePercent?: number;
}

export default function PdfMarginOverlay({
  thumbnailDataUrl,
  filename,
  bleedPercent = 5,
  safePercent = 10,
}: Props) {
  const [showOverlay, setShowOverlay] = useState(false);

  return (
    <div
      style={{
        width: '92%',
        aspectRatio: '7/4',
        background: 'white',
        border: '1px solid var(--border-default)',
        borderRadius: 2,
        boxShadow: 'var(--shadow-md)',
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailDataUrl}
        alt={`Aperçu de ${filename}`}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          background: 'white',
        }}
      />

      {showOverlay && (
        <>
          {/* SVG overlay full-bleed avec viewBox 100x100 — coords en
              pourcentages directement. Préserve les ratios sans calcul. */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
            aria-hidden
          >
            {/* Bleed area : tout le contour du PDF, en rouge transparent
                pour montrer "zone qui peut être coupée". */}
            <rect
              x={0} y={0} width={100} height={100}
              fill="rgba(239,68,68,0.12)"
              stroke="rgba(239,68,68,0.6)"
              strokeWidth={0.3}
            />
            {/* Trim line : rectangle solide noir = où le papier sera coupé. */}
            <rect
              x={bleedPercent} y={bleedPercent}
              width={100 - bleedPercent * 2}
              height={100 - bleedPercent * 2}
              fill="none"
              stroke="rgba(20,28,22,0.85)"
              strokeWidth={0.4}
            />
            {/* Safe zone : rectangle en tirets = "garde ton texte ici". */}
            <rect
              x={safePercent} y={safePercent}
              width={100 - safePercent * 2}
              height={100 - safePercent * 2}
              fill="none"
              stroke="rgba(31,61,43,0.85)"
              strokeWidth={0.4}
              strokeDasharray="1.5,1"
            />
          </svg>
        </>
      )}

      {/* Toggle button : flottant top-right */}
      <button
        type="button"
        onClick={() => setShowOverlay((v) => !v)}
        title={showOverlay ? 'Masquer les marges' : 'Vérifier les marges (bleed + safe zone)'}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          padding: '6px 12px',
          background: showOverlay ? 'var(--accent-primary)' : 'rgba(255,255,255,0.92)',
          color: showOverlay ? 'white' : 'var(--text-primary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-pill)',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
        }}
      >
        {showOverlay ? '✓ Marges' : '🎯 Marges'}
      </button>

      {/* Filename overlay bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(0deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
          padding: '24px 12px 8px',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          color: 'white',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {filename}
        </span>
        <span style={{ opacity: 0.8, whiteSpace: 'nowrap' }}>page 1 / aperçu</span>
      </div>

      {/* Legend (only shown quand overlay actif) */}
      {showOverlay && (
        <div
          style={{
            position: 'absolute',
            left: 8,
            bottom: 36,
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.6,
            color: 'var(--text-primary)',
            display: 'grid',
            gap: 3,
            backdropFilter: 'blur(4px)',
            maxWidth: 180,
          }}
        >
          <LegendRow color="rgba(239,68,68,0.6)" label="Bleed (sera coupé)" />
          <LegendRow color="rgba(20,28,22,0.85)" label="Trim (coupe finale)" />
          <LegendRow color="rgba(31,61,43,0.85)" label="Safe (texte sûr ici)" dashed />
        </div>
      )}
    </div>
  );
}

function LegendRow({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 16,
          height: 2,
          background: dashed ? 'transparent' : color,
          borderBottom: dashed ? `2px dashed ${color}` : 'none',
        }}
      />
      <span>{label}</span>
    </div>
  );
}
