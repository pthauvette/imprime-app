'use client';

/**
 * Overlay SVG bleed / trim / safe zone par-dessus le thumbnail PDF rendu
 * dans /order/upload. Aide le customer à vérifier visuellement que ses
 * fichiers respectent les marges avant de checkout.
 *
 * Corrigé (audit #3) :
 *   1. ALIGNEMENT — la container prend le VRAI ratio de l'image (mesuré à
 *      l'onLoad), donc l'image n'est plus letterboxée et le SVG se cale
 *      exactement dessus. Avant : container 7:4 fixe + image object-fit:contain
 *      + SVG preserveAspectRatio:none → pour tout PDF ≠ 7:4 les repères
 *      tombaient À CÔTÉ de l'image.
 *   2. MÉTRIQUE PAR AXE — les insets viennent des VRAIES dimensions (bleed/safe
 *      en pouces ÷ taille de page), calculés séparément en X et Y (un format
 *      non carré a un % de bleed différent en largeur et en hauteur). Avant :
 *      % « lisibles » inventés, identiques X/Y. Un plancher de visibilité évite
 *      les lignes invisibles sur grand format sans trop exagérer.
 *   3. Pas de fond perdu (enveloppes, bleed=0) → on ne dessine ni le rect bleed
 *      rouge ni une ligne de trim dupliquée.
 *
 * Légende : Rouge = bord/bleed (sera coupé) · Noir = trim (coupe finale) ·
 * Tirets = safe (garde le texte ici).
 */

import { useEffect, useRef, useState } from 'react';
import type { MarginSpec } from '@/lib/products/margin-specs';
import { Icon } from '@/components/ui/Icon';

interface Props {
  thumbnailDataUrl: string;
  filename: string;
  /** Spec du produit : bleed/safe en pouces + taille typique → insets métriques. */
  marginSpec: MarginSpec;
}

/** % minimum d'un inset pour rester VISIBLE même sur grand format. */
const MIN_VISIBLE_PCT = 2.2;
/** Bornes d'affichage : on plafonne par la LARGEUR (jamais la hauteur — ça
 *  violerait aspect-ratio et re-letterboxerait l'image). */
const MAX_H = 420;
const MAX_W = 520;

export default function PdfMarginOverlay({ thumbnailDataUrl, filename, marginSpec }: Props) {
  const [showOverlay, setShowOverlay] = useState(false);

  const bleedIn = marginSpec.bleedInches;
  const safeIn = marginSpec.safeInches;
  // Taille de page = trim typique + bleed sur chaque côté (= ce que le PDF DEVRAIT faire).
  const pageW = marginSpec.typicalTrim.widthIn + bleedIn * 2;
  const pageH = marginSpec.typicalTrim.heightIn + bleedIn * 2;
  // Ratio initial = ratio de page (évite le saut de layout) ; affiné au vrai ratio image.
  const [aspect, setAspect] = useState<number>(pageW / pageH || 7 / 4);

  // Le ratio doit suivre l'IMAGE réelle (pas la spec) sinon l'image se letterboxe.
  // onLoad seul est non fiable pour un data-URL : il peut finir de charger AVANT
  // que React câble le handler → événement manqué. On lit donc aussi les dimensions
  // dans un effet (au cas où l'image est déjà `complete` au montage).
  const imgRef = useRef<HTMLImageElement>(null);
  const applyAspect = () => {
    const img = imgRef.current;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setAspect(img.naturalWidth / img.naturalHeight);
    }
  };
  useEffect(() => {
    applyAspect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbnailDataUrl]);

  // Plafond de largeur dérivé du ratio : pour un portrait, on borne la largeur à
  // MAX_H·aspect → la hauteur reste ≤ MAX_H sans jamais brider aspect-ratio.
  const maxWidthPx = aspect < 1 ? Math.min(MAX_W, MAX_H * aspect) : MAX_W;

  // Inset % par axe. floored = avec plancher de visibilité (lignes safe/trim).
  const pct = (insetIn: number, page: number, floor = true) => {
    const raw = (insetIn / page) * 100;
    return floor && raw > 0 ? Math.max(raw, MIN_VISIBLE_PCT) : raw;
  };
  const hasBleed = bleedIn > 0;
  const trimX = pct(bleedIn, pageW);
  const trimY = pct(bleedIn, pageH);
  const safeX = pct(bleedIn + safeIn, pageW);
  const safeY = pct(bleedIn + safeIn, pageH);

  return (
    <div
      style={{
        width: '92%',
        maxWidth: maxWidthPx,
        aspectRatio: `${aspect}`,
        background: 'white',
        border: '1px solid var(--border-default)',
        borderRadius: 2,
        boxShadow: 'var(--shadow-md)',
        position: 'relative',
        overflow: 'hidden',
        margin: '0 auto',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={thumbnailDataUrl}
        alt={`Aperçu de ${filename}`}
        onLoad={applyAspect}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', background: 'white' }}
      />

      {showOverlay && (
        // viewBox 100x100 + preserveAspectRatio:none → mappé 1:1 sur l'image
        // (la container a maintenant le ratio de l'image, donc pas de letterbox).
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          aria-hidden
        >
          {hasBleed && (
            <rect x={0} y={0} width={100} height={100} fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.6)" strokeWidth={0.3} />
          )}
          {/* Trim : où le papier est coupé (au bord si pas de bleed). */}
          <rect
            x={trimX} y={trimY}
            width={100 - trimX * 2} height={100 - trimY * 2}
            fill="none" stroke="rgba(20,28,22,0.85)" strokeWidth={0.4}
          />
          {/* Safe : garde le texte à l'intérieur. */}
          <rect
            x={safeX} y={safeY}
            width={100 - safeX * 2} height={100 - safeY * 2}
            fill="none" stroke="rgba(31,61,43,0.85)" strokeWidth={0.4} strokeDasharray="1.5,1"
          />
        </svg>
      )}

      <button
        type="button"
        onClick={() => setShowOverlay((v) => !v)}
        title={showOverlay ? 'Masquer les marges' : 'Vérifier les marges (bleed + safe zone)'}
        style={{
          position: 'absolute', top: 8, right: 8, padding: '6px 12px',
          background: showOverlay ? 'var(--accent-primary)' : 'rgba(255,255,255,0.92)',
          color: showOverlay ? 'white' : 'var(--text-primary)',
          border: '1px solid var(--border-default)', borderRadius: 'var(--r-pill)',
          fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
          textTransform: 'uppercase', cursor: 'pointer', backdropFilter: 'blur(4px)',
        }}
      >
        {showOverlay ? <><Icon name="check" size={14} /> Marges</> : <><Icon name="target" size={14} /> Marges</>}
      </button>

      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(0deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
          padding: '24px 12px 8px', display: 'flex', alignItems: 'baseline',
          justifyContent: 'space-between', gap: 8, color: 'white', fontSize: 11, fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{filename}</span>
        <span style={{ opacity: 0.8, whiteSpace: 'nowrap' }}>page 1 / aperçu</span>
      </div>

      {showOverlay && (
        <div
          style={{
            position: 'absolute', left: 8, bottom: 36, padding: '8px 10px',
            background: 'rgba(255,255,255,0.95)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)', fontSize: 10, fontFamily: 'var(--font-mono)', lineHeight: 1.6,
            color: 'var(--text-primary)', display: 'grid', gap: 3, backdropFilter: 'blur(4px)', maxWidth: 180,
          }}
        >
          {hasBleed && <LegendRow color="rgba(239,68,68,0.6)" label="Bleed (sera coupé)" />}
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
      <span style={{ width: 16, height: 2, background: dashed ? 'transparent' : color, borderBottom: dashed ? `2px dashed ${color}` : 'none' }} />
      <span>{label}</span>
    </div>
  );
}
