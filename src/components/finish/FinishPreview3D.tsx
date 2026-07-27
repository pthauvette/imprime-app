'use client';

/**
 * Aperçu 3D réaliste de l'effet de FINITION d'un produit imprimé (#5).
 *
 * Rend une carte (boîte fine) avec un `MeshPhysicalMaterial` paramétré depuis
 * `finishMaterial(finition, papier)` — vernis UV brillant, soft-touch velours,
 * Spot UV sélectif (via clearcoatMap), foil métallique, etc. La carte s'incline
 * vers le pointeur pour faire « balayer » le reflet (sans mouvement, un gloss est
 * invisible). Reflets fournis par un environnement studio PROCÉDURAL (Lightformer,
 * aucun fetch HDR).
 *
 * ⚠️ Chargé UNIQUEMENT via le wrapper `FinishPreview` (next/dynamic ssr:false) →
 * Three.js ne touche jamais le SSR ni le bundle principal.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, type ThreeElements } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { finishMaterial, fitCardDimensions, type FinishMaterial } from '@/lib/print/finish-materials';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export interface FinishPreview3DProps {
  finishKey: string | null;
  paperKey?: string | null;
  /** Ratio largeur/hauteur de la carte (défaut 3.5:2 = carte de visite). */
  aspect?: number;
  /** Hauteur du canvas en px (défaut 280). */
  height?: number;
}

/** Dessine la face démo + le masque de vernis sélectif (Spot UV) en CanvasTexture.
 *  Layout ADAPTÉ à l'orientation : paysage (carte de visite…) = cluster à gauche ;
 *  portrait (flyer, signet, invitation, carte postale…) = composition centrée verticale.
 *  La texture est CAPÉE à 1024 px sur le grand côté (un signet 2×8 ne crée plus un
 *  canvas de 4096 px de haut). */
function makeCardTextures(mat: FinishMaterial, aspect: number): { map: THREE.CanvasTexture; mask: THREE.CanvasTexture } {
  const LONG = 1024;
  const W = aspect >= 1 ? LONG : Math.max(180, Math.round(LONG * aspect));
  const H = aspect >= 1 ? Math.max(180, Math.round(LONG / aspect)) : LONG;
  const portrait = aspect < 0.95;
  const S = Math.min(W, H); // échelle sur le petit côté (lisible à toute proportion)
  const GREEN = '#1f3d2b';
  const CREAM = '#fbfaf7';

  // Pastille ronde « P » (cible du Spot UV) + bande verte — positionnées par orientation.
  const r = S * (portrait ? 0.15 : 0.11);
  const cx = portrait ? W * 0.5 : W * 0.16;
  const cy = portrait ? H * 0.22 : H * 0.30;
  const band = Math.round(H * (portrait ? 0.14 : 0.28));
  const drawMark = (ctx: CanvasRenderingContext2D) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };

  // ── Face ──
  const face = document.createElement('canvas');
  face.width = W; face.height = H;
  const c = face.getContext('2d')!;
  c.fillStyle = mat.baseTint ?? CREAM;
  c.fillRect(0, 0, W, H);
  c.fillStyle = GREEN; c.fillRect(0, H - band, W, band);          // bande de marque (bas)
  c.fillStyle = GREEN; drawMark(c);                                // pastille « P »
  c.fillStyle = CREAM;
  c.font = `700 ${Math.round(r * 1.3)}px Georgia, serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('P', cx, cy + r * 0.04);

  c.textBaseline = 'alphabetic';
  if (portrait) {
    // Composition centrée (flyer / affiche / signet / invitation).
    c.textAlign = 'center';
    c.fillStyle = '#1c1c1a';
    c.font = `600 ${Math.round(S * 0.12)}px Georgia, serif`;
    c.fillText('Atelier Plio', W * 0.5, cy + r + S * 0.20);
    c.fillStyle = '#6b6a64';
    c.font = `400 ${Math.round(S * 0.065)}px system-ui, sans-serif`;
    c.fillText('Aperçu de finition', W * 0.5, cy + r + S * 0.20 + S * 0.12);
  } else {
    // Cluster à gauche (carte de visite / accroche-porte).
    c.textAlign = 'left';
    c.fillStyle = '#1c1c1a';
    c.font = `600 ${Math.round(H * 0.085)}px Georgia, serif`;
    c.fillText('Claire Tremblay', W * 0.30, H * 0.30);
    c.fillStyle = '#6b6a64';
    c.font = `400 ${Math.round(H * 0.05)}px system-ui, sans-serif`;
    c.fillText('Designer · Atelier Plio', W * 0.30, H * 0.30 + H * 0.085);
    c.fillStyle = '#cfe6d6';
    c.font = `400 ${Math.round(H * 0.045)}px system-ui, sans-serif`;
    c.fillText('claire@plio.ca   ·   514 555 0123', W * 0.06, H - band * 0.42);
  }

  // ── Masque de vernis sélectif (blanc = vernis) : la pastille + le titre brillent ──
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W; maskCanvas.height = H;
  const m = maskCanvas.getContext('2d')!;
  m.fillStyle = '#000000'; m.fillRect(0, 0, W, H);
  m.fillStyle = '#ffffff'; drawMark(m);
  m.textBaseline = 'alphabetic';
  if (portrait) {
    m.textAlign = 'center';
    m.font = `600 ${Math.round(S * 0.12)}px Georgia, serif`;
    m.fillText('Atelier Plio', W * 0.5, cy + r + S * 0.20);
  } else {
    m.textAlign = 'left';
    m.font = `600 ${Math.round(H * 0.085)}px Georgia, serif`;
    m.fillText('Claire Tremblay', W * 0.30, H * 0.30);
  }

  const map = new THREE.CanvasTexture(face);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const mask = new THREE.CanvasTexture(maskCanvas);

  return { map, mask };
}

function Card({ finishKey, paperKey, aspect }: { finishKey: string | null; paperKey?: string | null; aspect: number }) {
  const mat = useMemo(() => finishMaterial(finishKey, paperKey), [finishKey, paperKey]);
  const { map, mask } = useMemo(() => makeCardTextures(mat, aspect), [mat, aspect]);
  const ref = useRef<THREE.Mesh>(null);
  // finding [86] — la boucle useFrame ci-dessous est une animation JS continue
  // (rAF), hors de portée de la règle CSS globale @media(prefers-reduced-motion)
  // (globals.css) qui ne neutralise que animation/transition CSS. On la
  // désactive nous-même quand l'utilisateur préfère moins de mouvement.
  const reducedMotion = usePrefersReducedMotion();

  // Angle de REPOS en 3/4 (les reflets accrochent mal de face) + inclinaison vers
  // le pointeur + léger flottement → le highlight BALAYE la surface (sans mouvement
  // un gloss est invisible, et mat vs brillant se distingue par la façon dont la
  // lumière glisse).
  useFrame((state) => {
    if (reducedMotion) return; // pose fixe posée une fois ci-dessous, aucune oscillation
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    const targetY = 0.32 + state.pointer.x * 0.55 + Math.sin(t * 0.45) * 0.16;
    const targetX = -0.16 - state.pointer.y * 0.4 + Math.cos(t * 0.35) * 0.08;
    mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, targetY, 0.07);
    mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, targetX, 0.07);
  });

  // Pose statique équivalente au repos animé, posée UNE fois (pas de transition
  // ni d'oscillation) quand le mouvement réduit est préféré.
  useEffect(() => {
    if (!reducedMotion) return;
    const mesh = ref.current;
    if (!mesh) return;
    mesh.rotation.y = 0.32;
    mesh.rotation.x = -0.16;
  }, [reducedMotion]);

  // Boîte normalisée : le grand côté tient dans le cadre, ratio réel préservé.
  const { w, h } = fitCardDimensions(aspect);
  // Foil = carte métallique teintée ; sinon couleur de base (teinte papier) ou blanc.
  const color = mat.foilColor ?? mat.baseTint ?? '#ffffff';

  const materialProps: ThreeElements['meshPhysicalMaterial'] = {
    map: mat.foilColor ? null : map, // le foil masque le design (démonstration du métal)
    color,
    roughness: mat.roughness,
    metalness: mat.metalness,
    clearcoat: mat.clearcoat,
    clearcoatRoughness: mat.clearcoatRoughness,
    sheen: mat.sheen,
    sheenRoughness: mat.sheenRoughness,
    sheenColor: new THREE.Color(mat.sheenColor),
    iridescence: mat.iridescence,
    iridescenceIOR: 1.3,
    envMapIntensity: 1.1,
    // Spot UV : le clearcoat ne s'applique QUE là où le masque est blanc.
    ...(mat.spotUv ? { clearcoatMap: mask } : {}),
  };

  return (
    <mesh ref={ref} castShadow>
      <boxGeometry args={[w, h, 0.05]} />
      <meshPhysicalMaterial {...materialProps} />
    </mesh>
  );
}

export default function FinishPreview3D({ finishKey, paperKey, aspect = 3.5 / 2, height = 280 }: FinishPreview3DProps) {
  return (
    // finding [86] — un <canvas> nu n'a aucun nom accessible : un lecteur
    // d'écran ne signale rien de ce que ce bloc représente.
    <div
      role="img"
      aria-label="Aperçu 3D de la finition sélectionnée"
      style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }}
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 28 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[3, 4, 5]} intensity={0.8} />
        <Card finishKey={finishKey} paperKey={paperKey} aspect={aspect} />
        {/* Environnement studio PROCÉDURAL → reflets sur le vernis/foil, sans fetch HDR. */}
        <Environment resolution={256}>
          {/* Panneau doux d'ambiance. */}
          <Lightformer intensity={1.6} position={[0, 1.5, 4]} scale={[7, 5, 1]} color="#ffffff" />
          {/* Bande BRILLANTE concentrée = le « streak » qui révèle le vernis/le métal
              (sur mat il reste diffus, sur UV/foil il devient une raie nette). */}
          <Lightformer form="rect" intensity={6} position={[-1.6, 2.2, 3.2]} rotation={[0, 0, Math.PI / 5]} scale={[1.2, 5, 1]} color="#ffffff" />
          <Lightformer intensity={1.1} position={[-4, 1, 2]} scale={[3, 5, 1]} color="#dfe8ff" />
          <Lightformer intensity={1.1} position={[4, -1, 2]} scale={[3, 5, 1]} color="#fff0df" />
          <Lightformer intensity={0.6} position={[0, -3, 1]} scale={[8, 3, 1]} color="#ffffff" />
        </Environment>
      </Canvas>
    </div>
  );
}
