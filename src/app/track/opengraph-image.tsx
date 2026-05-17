/**
 * OG image pour /track. Évoque le suivi de colis.
 */

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Plio — Suivre une commande';
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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontFamily: 'monospace',
          fontSize: 18,
          color: '#1F3D2B',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}>
          <span style={{ width: 12, height: 12, background: '#1F3D2B', borderRadius: 6 }} />
          PLIO · SUIVI DE COMMANDE
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 800 }}>
          <div style={{
            fontFamily: 'serif',
            fontSize: 88,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            color: '#141C16',
            fontWeight: 400,
          }}>
            Où en est <em style={{ color: '#1F3D2B', fontStyle: 'italic' }}>ma commande</em> ?
          </div>
          <div style={{
            fontSize: 24,
            color: '#4A554D',
            lineHeight: 1.5,
            fontFamily: 'sans-serif',
          }}>
            Entre ton numéro + email — aucun compte requis. Status en 1 click.
          </div>
        </div>

        {/* Bottom : progress dots simulant le tracking */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'monospace', fontSize: 11, color: '#4A554D' }}>
            {[
              { label: 'PAYÉE', done: true },
              { label: 'PRESSE', done: true },
              { label: 'PRODUCTION', done: true },
              { label: 'EXPÉDIÉE', done: false },
              { label: 'LIVRÉE', done: false },
            ].map((step, i, arr) => (
              <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 8,
                  background: step.done ? '#1F3D2B' : '#FFFFFF',
                  border: '2px solid',
                  borderColor: step.done ? '#1F3D2B' : '#7A8780',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {step.done && <span style={{ color: 'white', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: step.done ? '#1F3D2B' : '#7A8780', fontWeight: step.done ? 700 : 500 }}>
                  {step.label}
                </span>
                {i < arr.length - 1 && (
                  <div style={{ width: 24, height: 1, background: step.done && arr[i + 1].done ? '#1F3D2B' : '#7A8780' }} />
                )}
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
