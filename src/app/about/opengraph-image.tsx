/**
 * OG image pour /about — focus narrative + équipe.
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Plio — Notre histoire';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1F3D2B',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          position: 'relative',
          color: '#FAFAF7',
        }}
      >
        {/* Subtle dot grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.08,
            backgroundImage: 'radial-gradient(circle at 1px 1px, #FFFFFF 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontFamily: 'monospace',
          fontSize: 18,
          color: '#F5C95E',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}>
          <span style={{ width: 12, height: 12, background: '#F5C95E', borderRadius: 6 }} />
          PLIO · NOTRE HISTOIRE · MONTRÉAL
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 900 }}>
          <div style={{
            fontFamily: 'serif',
            fontSize: 88,
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
            fontWeight: 400,
            color: '#FAFAF7',
          }}>
            On rebrasse <em style={{ color: '#F5C95E', fontStyle: 'italic' }}>l&apos;expérience</em> du print.
          </div>
          <div style={{
            fontSize: 24,
            color: '#C9D4CC',
            lineHeight: 1.5,
            fontFamily: 'sans-serif',
            maxWidth: 800,
          }}>
            Devis instantané, prix wholesale, pas de soumissions, pas de relances.
            Plio simplifie tout ce qui se passe avant la presse.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#C9D4CC' }}>
            Fondé en 2026 · Bureaux à Montréal · Démocratik inc.
          </div>
          <div style={{
            fontFamily: 'serif',
            fontSize: 56,
            color: '#F5C95E',
            letterSpacing: '-0.025em',
            fontWeight: 400,
          }}>
            Plio.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
