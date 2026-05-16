/**
 * /order/upload?productId=N&options=... — Step 5 wizard.
 *
 * Mock implementation: en attendant une vraie intégration storage
 * (UploadThing/R2/S3), on offre 2 boutons "Use placeholder PDF" qui
 * remplit l'URL dans l'état et permet de passer au step suivant.
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useState, useEffect, Suspense } from 'react';

const PLACEHOLDER_RECTO = 'https://www.sinalite.com/documents/recto-placeholder.pdf';
const PLACEHOLDER_VERSO = 'https://www.sinalite.com/documents/verso-placeholder.pdf';

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadPageInner />
    </Suspense>
  );
}

function UploadPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const options = searchParams.get('options') ?? '';
  const designId = searchParams.get('designId');

  const [recto, setRecto] = useState<string | null>(null);
  const [verso, setVerso] = useState<string | null>(null);

  // Auto-fill recto si l'utilisateur arrive depuis l'éditeur de template
  // (designId présent dans l'URL) — le PDF généré est servi par /api/designs/[id]/pdf
  useEffect(() => {
    if (!designId || recto !== null) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setRecto(`${origin}/api/designs/${designId}/pdf`);
  }, [designId, recto]);

  const filesParam = [
    recto ? `front:${encodeURIComponent(recto)}` : null,
    verso ? `back:${encodeURIComponent(verso)}` : null,
  ]
    .filter(Boolean)
    .join('|');

  const designSuffix = designId ? `&designId=${designId}` : '';
  const nextHref = `/order/shipping?productId=${productId}&options=${options}&files=${filesParam}${designSuffix}` as Route;
  const prevHref = `/order/quantity?productId=${productId}&options=${options}${designSuffix}` as Route;
  const canContinue = recto !== null;

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>
            Imprime.
          </Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb">Téléverse ton design</span>
        </div>
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuenow={5} aria-valuemin={1} aria-valuemax={7}>
            <div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 05 sur 07 — Téléverse ton design</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <button className="btn btn-ghost btn-sm">⌘ K</button>
        </div>
      </header>

      <main className="step-layout">
        <div className="step-content" style={{ padding: '56px 80px', maxWidth: 1080 }}>
          <div className="step-eyebrow">Étape 05</div>
          <h1 className="step-question">Téléverse ton <em>design.</em></h1>
          <p className="step-lede">
            PDF, AI, PSD ou JPG. On vérifie automatiquement bleed, résolution et CMYK
            avant la production.
          </p>

          <div
            style={{
              padding: '16px 20px',
              background: 'var(--warning-soft)',
              border: '1px solid var(--warning)',
              borderRadius: 'var(--r-md)',
              marginBottom: 32,
              fontSize: 14,
              color: 'var(--text-primary)',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <span>⚠️</span>
            <span>
              <strong>Mode démo :</strong> l'upload de vrais fichiers nécessite un provider de stockage (UploadThing/R2/S3).
              Pour tester le flow end-to-end, utilise les boutons « Use placeholder PDF » ci-dessous.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <Dropzone
              label="Recto"
              required
              fileUrl={recto}
              onUsePlaceholder={() => setRecto(PLACEHOLDER_RECTO)}
              onClear={() => setRecto(null)}
            />
            <Dropzone
              label="Verso"
              required={false}
              fileUrl={verso}
              onUsePlaceholder={() => setVerso(PLACEHOLDER_VERSO)}
              onClear={() => setVerso(null)}
            />
          </div>
        </div>

        <aside className="recap">
          <div>
            <div className="recap-section-label">Fichiers</div>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <FileStatus label="Recto" url={recto} />
              <FileStatus label="Verso" url={verso} />
            </div>
          </div>
          <div
            style={{
              padding: 16,
              background: 'var(--bg-canvas)',
              border: '1px dashed var(--border-default)',
              borderRadius: 'var(--r-md)',
              fontSize: 12,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            🔒 Tes fichiers seront chiffrés.<br />
            🗑 Supprimés 30 jours après livraison.<br />
            💬 Notre prépresse les revoit avant impression.
          </div>
        </aside>
      </main>

      <footer className="shell-footer">
        <div>
          <Link href={prevHref} className="btn btn-ghost">
            <span style={{ fontFamily: 'var(--font-mono)' }}>←</span> Précédent
          </Link>
        </div>
        <div className="shell-footer-center">↵ Entrée pour continuer · Téléverse au moins le recto</div>
        <div className="shell-footer-right">
          <button
            className="btn btn-primary"
            onClick={() => router.push(nextHref)}
            disabled={!canContinue}
            style={{ opacity: canContinue ? 1 : 0.4, cursor: canContinue ? 'pointer' : 'not-allowed' }}
          >
            Adresse de livraison <kbd>↵</kbd>
          </button>
        </div>
      </footer>
    </div>
  );
}

function Dropzone({
  label,
  required,
  fileUrl,
  onUsePlaceholder,
  onClear,
}: {
  label: string;
  required: boolean;
  fileUrl: string | null;
  onUsePlaceholder: () => void;
  onClear: () => void;
}) {
  const isUploaded = fileUrl !== null;
  return (
    <div
      style={{
        background: 'var(--bg-canvas)',
        border: `2px ${isUploaded ? 'solid var(--success)' : 'dashed var(--border-default)'}`,
        borderRadius: 'var(--r-lg)',
        minHeight: 360,
        padding: 24,
        display: 'grid',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {label}
          {required ? ' · requis' : ' · optionnel'}
        </span>
        {isUploaded && (
          <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
            ✓ Validé
          </span>
        )}
      </div>

      <div
        style={{
          background: isUploaded ? 'var(--paper-warm)' : 'white',
          borderRadius: 'var(--r-md)',
          padding: 32,
          display: 'grid',
          placeItems: 'center',
          aspectRatio: '7/4',
          position: 'relative',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        {isUploaded ? (
          <div
            style={{
              width: '92%',
              aspectRatio: '7/4',
              background: 'white',
              border: '1px solid var(--border-default)',
              borderRadius: 2,
              boxShadow: 'var(--shadow-md)',
              padding: 24,
              display: 'grid',
              alignContent: 'center',
              gap: 6,
              position: 'relative',
            }}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              Placeholder — {label}
            </div>
            <div style={{ width: 24, height: 1, background: 'var(--accent-primary)', margin: '4px 0' }} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 }}>
              Vrai design à venir
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
              {fileUrl}
            </div>
          </div>
        ) : (
          <>
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth={1.5}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, textAlign: 'center' }}>
              Glisse ton fichier ici
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
              ou utilise le bouton placeholder ci-dessous
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em', textAlign: 'center' }}>
              PDF · 300 DPI · CMYK · bleed 0,125"
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        {isUploaded ? (
          <>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
              ✓ placeholder.pdf
            </span>
            <button
              onClick={onClear}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--danger)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}
            >
              Retirer
            </button>
          </>
        ) : (
          <button
            onClick={onUsePlaceholder}
            className="btn btn-secondary btn-sm"
            style={{ width: '100%' }}
          >
            ⚡ Use placeholder PDF (mock)
          </button>
        )}
      </div>
    </div>
  );
}

function FileStatus({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--bg-surface)',
          border: '1px dashed var(--border-default)',
          borderRadius: 'var(--r-md)',
          fontSize: 13,
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>—</span>
      </div>
    );
  }
  return (
    <div
      style={{
        padding: '10px 14px',
        background: 'var(--success-soft)',
        border: '1px solid var(--success)',
        borderRadius: 'var(--r-md)',
        fontSize: 13,
        color: 'var(--text-primary)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <strong>{label}</strong>
      <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>✓ Validé</span>
    </div>
  );
}
