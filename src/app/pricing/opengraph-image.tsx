/**
 * OG image pour /pricing.
 *
 * Highlight le prix par carte le plus bas (8 cents) pour entice le click
 * quand quelqu'un partage le link sur Slack/Whatsapp/Discord.
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Plio — Tarifs wholesale transparents';
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
        {/* Dot grid background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.12,
            backgroundImage: 'radial-gradient(circle at 1px 1px, #141C16 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Top eyebrow */}
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
          <span style={{ width: 12, height: 12, background: '#1F3D2B', borderRadius: 6 }} />
          PLIO · TARIFS WHOLESALE · CAD
        </div>

        {/* Price callout - large */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div style={{
            fontFamily: 'serif',
            fontSize: 88,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: '#141C16',
            fontWeight: 400,
          }}>
            <em style={{ fontStyle: 'italic', color: '#1F3D2B' }}>0,08 $</em> / carte
          </div>
          <div style={{
            fontSize: 28,
            color: '#4A554D',
            lineHeight: 1.4,
            fontFamily: 'sans-serif',
            maxWidth: 800,
          }}>
            À partir de 1000 unités · 14pt UV recto-verso · livré au Canada.
            <br />
            <span style={{ color: '#1F3D2B', fontWeight: 600 }}>Sans abonnement. Sans minimum absurde.</span>
          </div>
        </div>

        {/* Bottom: price chips + wordmark */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 12, fontFamily: 'monospace', fontSize: 14 }}>
            {[
              { qty: '250', price: '0,18 $' },
              { qty: '500', price: '0,12 $' },
              { qty: '1 000', price: '0,08 $' },
            ].map((p) => (
              <div key={p.qty} style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '12px 18px',
                background: '#FFFFFF',
                border: '1px solid #ECEAE3',
                borderRadius: 8,
              }}>
                <span style={{ color: '#7A8780', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {p.qty} u.
                </span>
                <span style={{ color: '#141C16', fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                  {p.price}
                </span>
              </div>
            ))}
          </div>
          <div style={{
            fontFamily: 'serif',
            fontSize: 56,
            color: '#1F3D2B',
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
