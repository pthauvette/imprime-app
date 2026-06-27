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

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, type ThreeElements } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { finishMaterial, type FinishMaterial } from '@/lib/print/finish-materials';

export interface FinishPreview3DProps {
  finishKey: string | null;
  paperKey?: string | null;
  /** Ratio largeur/hauteur de la carte (défaut 3.5:2 = carte de visite). */
  aspect?: number;
  /** Hauteur du canvas en px (défaut 280). */
  height?: number;
}

const CARD_W = 3.5;

/** Dessine la face démo + le masque de vernis sélectif (Spot UV) en CanvasTexture. */
function makeCardTextures(mat: FinishMaterial, aspect: number): { map: THREE.CanvasTexture; mask: THREE.CanvasTexture } {
  const W = 1024;
  const H = Math.round(W / aspect);

  // ── Face ──
  const face = document.createElement('canvas');
  face.width = W; face.height = H;
  const c = face.getContext('2d')!;
  c.fillStyle = mat.baseTint ?? '#fbfaf7';
  c.fillRect(0, 0, W, H);

  // Bande de marque (vert Plio) en bas.
  const band = Math.round(H * 0.28);
  c.fillStyle = '#1f3d2b';
  c.fillRect(0, H - band, W, band);

  // Marque ronde « P » (la zone qui reçoit le Spot UV).
  const cx = W * 0.16, cy = H * 0.30, r = Math.min(W, H) * 0.11;
  c.fillStyle = '#1f3d2b';
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fbfaf7';
  c.font = `700 ${Math.round(r * 1.3)}px Georgia, serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('P', cx, cy + r * 0.04);

  // Nom + titre.
  c.fillStyle = '#1c1c1a';
  c.font = `600 ${Math.round(H * 0.085)}px Georgia, serif`;
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText('Claire Tremblay', W * 0.30, H * 0.30);
  c.fillStyle = '#6b6a64';
  c.font = `400 ${Math.round(H * 0.05)}px system-ui, sans-serif`;
  c.fillText('Designer · Atelier Plio', W * 0.30, H * 0.30 + H * 0.085);

  // Coordonnées sur la bande.
  c.fillStyle = '#cfe6d6';
  c.font = `400 ${Math.round(H * 0.045)}px system-ui, sans-serif`;
  c.fillText('claire@plio.ca   ·   514 555 0123', W * 0.06, H - band * 0.42);

  // ── Masque de vernis sélectif (blanc = vernis) ──
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W; maskCanvas.height = H;
  const m = maskCanvas.getContext('2d')!;
  m.fillStyle = '#000000'; m.fillRect(0, 0, W, H);
  m.fillStyle = '#ffffff';
  // Le « P » + le nom brillent (usage typique du Spot UV).
  m.beginPath(); m.arc(cx, cy, r, 0, Math.PI * 2); m.fill();
  m.font = `600 ${Math.round(H * 0.085)}px Georgia, serif`;
  m.textAlign = 'left'; m.textBaseline = 'alphabetic';
  m.fillText('Claire Tremblay', W * 0.30, H * 0.30);

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

  // Angle de REPOS en 3/4 (les reflets accrochent mal de face) + inclinaison vers
  // le pointeur + léger flottement → le highlight BALAYE la surface (sans mouvement
  // un gloss est invisible, et mat vs brillant se distingue par la façon dont la
  // lumière glisse).
  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    const targetY = 0.32 + state.pointer.x * 0.55 + Math.sin(t * 0.45) * 0.16;
    const targetX = -0.16 - state.pointer.y * 0.4 + Math.cos(t * 0.35) * 0.08;
    mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, targetY, 0.07);
    mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, targetX, 0.07);
  });

  const h = CARD_W / aspect;
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
      <boxGeometry args={[CARD_W, h, 0.05]} />
      <meshPhysicalMaterial {...materialProps} />
    </mesh>
  );
}

export default function FinishPreview3D({ finishKey, paperKey, aspect = 3.5 / 2, height = 280 }: FinishPreview3DProps) {
  return (
    <div style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }}>
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
