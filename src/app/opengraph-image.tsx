/**
 * Open Graph image générée dynamiquement pour la home page.
 *
 * Next.js convention : un fichier `opengraph-image.tsx` (ou .png) dans
 * un segment génère l'OG image pour ce segment. Pour les child segments
 * qui veulent override, il suffit de créer leur propre opengraph-image.tsx.
 *
 * Servi à `https://www.plio.ca/opengraph-image` et automatiquement
 * référencé dans le <head> via Next.js metadata.
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Plio — print wholesale au Canada';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #FAFAF7 0%, #E5EDE8 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          fontFamily: 'serif',
          position: 'relative',
        }}
      >
        {/* Subtle dot grid background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.15,
            backgroundImage: 'radial-gradient(circle at 1px 1px, #141C16 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Floating business cards visual (top right) */}
        <div
          style={{
            position: 'absolute',
            top: 100,
            right: 80,
            width: 380,
            height: 280,
            display: 'flex',
          }}
        >
          {/* Card 3 — kraft beige */}
          <div
            style={{
              position: 'absolute',
              top: 60,
              left: 0,
              width: 280,
              height: 168,
              background: '#C9B89A',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(20,28,22,0.18)',
              transform: 'rotate(-6deg)',
            }}
          />
          {/* Card 2 — gold */}
          <div
            style={{
              position: 'absolute',
              top: 30,
              left: 50,
              width: 280,
              height: 168,
              background: '#F5C95E',
              borderRadius: 6,
              boxShadow: '0 12px 32px rgba(20,28,22,0.22)',
              transform: 'rotate(2deg)',
              display: 'flex',
              flexDirection: 'column',
              padding: '32px 28px',
            }}
          >
            <div style={{ fontFamily: 'serif', fontSize: 20, color: '#3d2818', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Maison Verte
            </div>
            <div style={{ width: 24, height: 1, background: '#3d2818', marginTop: 6, marginBottom: 8 }} />
            <div style={{ fontSize: 11, color: '#7a5a3a', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Architecture &amp; design
            </div>
          </div>
          {/* Card 1 — front, white with green accent */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 100,
              width: 280,
              height: 168,
              background: '#FFFFFF',
              borderRadius: 6,
              boxShadow: '0 16px 40px rgba(20,28,22,0.28)',
              transform: 'rotate(8deg)',
              display: 'flex',
              flexDirection: 'column',
              padding: '32px 28px',
              border: '1px solid #E5EDE8',
            }}
          >
            <div style={{ fontFamily: 'serif', fontSize: 22, color: '#141C16', fontWeight: 600, letterSpacing: '-0.02em' }}>
              Sophie Beauchamp
            </div>
            <div style={{ width: 28, height: 2, background: '#1F3D2B', marginTop: 6, marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: '#4A554D', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
              Directrice créative
            </div>
          </div>
        </div>

        {/* Top: eyebrow */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontFamily: 'monospace',
            fontSize: 18,
            color: '#1F3D2B',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              background: '#1F3D2B',
              borderRadius: 6,
            }}
          />
          PLIO · WHOLESALE PRINT · CANADA
        </div>

        {/* Bottom: headline + tagline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
          <div
            style={{
              fontFamily: 'serif',
              fontSize: 96,
              lineHeight: 1,
              letterSpacing: '-0.04em',
              color: '#141C16',
              fontWeight: 400,
            }}
          >
            Imprime ce que{' '}
            <span style={{ fontStyle: 'italic', color: '#1F3D2B' }}>tu veux,</span>
          </div>
          <div
            style={{
              fontFamily: 'serif',
              fontSize: 96,
              lineHeight: 1,
              letterSpacing: '-0.04em',
              color: '#141C16',
              fontWeight: 400,
              display: 'flex',
            }}
          >
            en <span style={{ fontStyle: 'italic', color: '#1F3D2B', marginLeft: 24 }}>2 minutes.</span>
          </div>
          <div
            style={{
              fontSize: 26,
              color: '#4A554D',
              lineHeight: 1.4,
              maxWidth: 640,
              fontFamily: 'sans-serif',
            }}
          >
            Devis instantané · prix wholesale · livraison partout au Canada en 1 à 7 jours.
          </div>
        </div>

        {/* Bottom right wordmark */}
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            right: 80,
            fontFamily: 'serif',
            fontSize: 56,
            color: '#1F3D2B',
            letterSpacing: '-0.025em',
            fontWeight: 400,
          }}
        >
          Plio.
        </div>
      </div>
    ),
    { ...size },
  );
}
