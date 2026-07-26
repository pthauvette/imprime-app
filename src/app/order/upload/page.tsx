/**
 * /order/upload?productId=N&options=... — Step 5 wizard.
 *
 * Vrai upload S3 via presigned POST :
 *   1. Client demande /api/uploads/presign { kind, contentType, filename }
 *   2. Browser POST directement vers S3 avec les fields signés
 *   3. publicUrl est stocké dans l'URL params du wizard pour le step suivant
 *
 * Fallback : si l'utilisateur arrive depuis l'éditeur de template
 * (?designId=...), le recto est auto-rempli avec /api/designs/[id]/pdf.
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useState, useEffect, useRef, Suspense, type ChangeEvent, type DragEvent } from 'react';
import PdfMarginOverlay from '@/components/upload/PdfMarginOverlay';
import { Icon } from '@/components/ui/Icon';
import ClientHeaderUserSlot from '@/components/account/ClientHeaderUserSlot';
import {
  getMarginSpecBySinaliteCategory,
  DEFAULT_MARGIN_SPEC,
  type MarginSpec,
} from '@/lib/products/margin-specs';
import { resolveSelectedSize, type ParsedSize } from '@/lib/products/parse-size';
import { buildFilesParam, parseFilesParam } from '@/lib/order/files-param';

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

  const [recto, setRecto] = useState<UploadedFile | null>(null);
  const [verso, setVerso] = useState<UploadedFile | null>(null);
  // Spec bleed/safe pour cette famille de produit — résolu depuis l'API
  // /api/products/[id] qui retourne la category Sinalite. Fallback default
  // safe (cartes-de-visite) si le fetch fail ou si pas de productId.
  const [marginSpec, setMarginSpec] = useState<MarginSpec>(DEFAULT_MARGIN_SPEC);
  // Taille EXACTE sélectionnée (groupe `size` du produit ⨉ options choisies),
  // en pouces. Permet le hard-block dimension à l'upload. null si non résolue
  // (taille custom / label non parsable) → on retombe sur un warning, jamais un
  // faux blocage.
  const [expectedDims, setExpectedDims] = useState<ParsedSize | null>(null);
  // Auto-fill depuis l'éditeur de template : état de la VÉRIF du PDF (cf. effet
  // ci-dessous). Tant que ce n'est pas confirmé 200+PDF, on ne marque PAS le
  // recto « Validé ».
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // Auto-fill recto si l'utilisateur arrive depuis l'éditeur de template
  // (?designId). AVANT, on posait le recto en aveugle → si /api/designs/[id]/pdf
  // renvoyait 404/500 (draft introuvable, non possédé, finalPdfUrl manquant),
  // canContinue passait true et on affichait « ✓ Validé » : l'user payait avec
  // un recto cassé, détecté seulement en prépresse. Maintenant on VÉRIFIE que
  // le PDF répond réellement (200 + Content-Type application/pdf) avant de poser
  // le recto. On utilise GET (et non HEAD) : la route n'exporte que GET, et on
  // ne veut pas dépendre de l'auto-HEAD de Next pour le chemin de paiement.
  useEffect(() => {
    if (!designId || recto !== null) return;
    let cancelled = false;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/api/designs/${designId}/pdf`;
    setTemplateLoading(true);
    setTemplateError(null);
    fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' })
      .then((res) => {
        if (cancelled) return;
        const isPdf = (res.headers.get('content-type') ?? '').includes('application/pdf');
        if (!res.ok || !isPdf) {
          setTemplateError(
            res.status === 404 || res.status === 401
              ? "Ton design n'a pas pu être chargé (lien expiré ou accès refusé). Téléverse ton fichier manuellement ci-dessous."
              : `Ton design n'a pas pu être vérifié (erreur ${res.status}). Téléverse ton fichier manuellement ci-dessous.`,
          );
          return;
        }
        setRecto({
          url,
          name: 'design-template.pdf',
          size: 0,
          contentType: 'application/pdf',
          isTemplate: true,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setTemplateError(
          "Ton design n'a pas pu être vérifié (problème réseau). Téléverse ton fichier manuellement ci-dessous.",
        );
      })
      .finally(() => {
        if (!cancelled) setTemplateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [designId, recto]);

  // Audit v2 #4.3 — réhydrate recto/verso depuis ?files quand on revient via
  // « Précédent » depuis shipping (qui porte désormais &files). Sans ça, la
  // dropzone était vide → re-upload forcé juste avant le paiement. On ne lit que
  // l'URL (les fichiers sont déjà uploadés sur S3) ; name/size sont
  // reconstruits pour l'affichage. Gardé sur `!designId` : si l'user vient de
  // l'éditeur, l'auto-fill design ci-dessus a priorité. First-writer-wins via
  // setState fonctionnel → n'écrase jamais un upload déjà présent.
  useEffect(() => {
    if (designId) return;
    const { frontUrl, backUrl } = parseFilesParam(searchParams.get('files'));
    const toFile = (url: string): UploadedFile => ({
      url,
      name: decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'fichier.pdf'),
      size: 0,
      contentType: 'application/pdf',
    });
    if (frontUrl) setRecto((cur) => cur ?? toFile(frontUrl));
    if (backUrl) setVerso((cur) => cur ?? toFile(backUrl));
    // Lecture unique au mount : on ne veut pas re-réhydrater à chaque édition
    // de l'URL (l'user pourrait avoir cleared volontairement un fichier).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch product category pour choisir les insets visuels de l'overlay
  // bleed/trim/safe. Best-effort : on garde le default si le fetch fail
  // ou si l'API renvoie une category inconnue.
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    void fetch(`/api/products/${productId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const category = data?.product?.category as string | undefined;
        if (category) setMarginSpec(getMarginSpecBySinaliteCategory(category));
        // Taille exacte : matche les options choisies contre le groupe `size`.
        const selectedIds = options.split(',').filter(Boolean).map(Number);
        const sizeGroup = data?.optionGroups?.size ?? data?.optionGroups?.Size;
        const sz = resolveSelectedSize(sizeGroup, selectedIds);
        if (sz) setExpectedDims(sz);
      })
      .catch(() => {
        // Garde le default — overlay reste visuellement utile
      });
    return () => {
      cancelled = true;
    };
  }, [productId, options]);

  const filesParam = buildFilesParam(recto?.url, verso?.url);

  const designSuffix = designId ? `&designId=${designId}` : '';
  const filesSuffix = filesParam ? `&files=${filesParam}` : '';
  const nextHref = `/order/shipping?productId=${productId}&options=${options}&files=${filesParam}${designSuffix}` as Route;
  // Porte aussi `files` vers l'ARRIÈRE (pas juste vers l'avant) — sinon un
  // aller-retour configure↔upload pour ajuster une option forçait un
  // re-téléversement. Cf. docs/experience-client-2026-07.md finding [27].
  const prevHref = `/order/configure?productId=${productId}&options=${options}${designSuffix}${filesSuffix}` as Route;
  const canContinue = recto !== null;

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>
            Plio.
          </Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb">Téléverse ton design</span>
        </div>
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuenow={4} aria-valuemin={1} aria-valuemax={6}>
            <div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 04 sur 06 — Téléverse ton design</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <ClientHeaderUserSlot hideWhenAnonymous />
        </div>
      </header>

      <main className="step-layout">
        {/* Round 40 #2 — padding via .step-content CSS so mobile @media wins */}
        <div className="step-content" style={{ maxWidth: 1080 }}>
          <div className="step-eyebrow">Étape 04</div>
          <h1 className="step-question">Téléverse ton <em>design.</em></h1>
          <p className="step-lede">
            PDF, AI, EPS, PSD, JPG, PNG ou TIFF (max 150 MB). On vérifie automatiquement le bleed,
            les dimensions et la résolution avant la production. Fournis un fichier CMYK : la
            conversion des couleurs se fait à la presse.
          </p>

          {designId && templateLoading && (
            <div
              role="status"
              style={{
                margin: '0 0 20px',
                padding: '12px 16px',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--r-md)',
                fontSize: 13,
                color: 'var(--text-secondary)',
              }}
            >
              ⏳ Vérification de ton design en cours…
            </div>
          )}
          {designId && templateError && (
            <div
              role="alert"
              style={{
                margin: '0 0 20px',
                padding: '12px 16px',
                background: 'var(--danger-soft)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--r-md)',
                fontSize: 13,
                color: 'var(--danger)',
                lineHeight: 1.5,
              }}
            >
              <Icon name="alert" size={13} /> {templateError}
            </div>
          )}

          {/* Round 40 #2 — auto-fit collapse to 1 col under 600px (vs forced 2-col before) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            <Dropzone
              label="Recto"
              kind="front"
              required
              file={recto}
              onChange={setRecto}
              onClear={() => setRecto(null)}
              marginSpec={marginSpec}
              expectedDims={expectedDims}
            />
            <Dropzone
              label="Verso"
              kind="back"
              required={false}
              file={verso}
              onChange={setVerso}
              onClear={() => setVerso(null)}
              marginSpec={marginSpec}
              expectedDims={expectedDims}
            />
          </div>
        </div>

        <aside className="recap">
          <div>
            <div className="recap-section-label">Fichiers</div>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <FileStatus label="Recto" file={recto} />
              <FileStatus label="Verso" file={verso} />
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
            <Icon name="lock" size={12} /> Fichiers stockés sur AWS S3 ca-central-1.<br />
            <Icon name="trash" size={12} /> Lifecycle policy : supprimés après 90 jours.<br />
            <Icon name="chat" size={12} /> Vérification automatique (fond perdu, dimensions, résolution) avant impression.
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

// ─── Upload state ─────────────────────────────────────────────────────────

interface UploadedFile {
  url: string;
  name: string;
  size: number;
  contentType: string;
  isTemplate?: boolean;
  /** Data URL JPEG (~50KB) de la page 1 si PDF rendu avec succès. */
  thumbnailDataUrl?: string;
}

interface UploadProgress {
  /** 0 to 100 */
  pct: number;
  filename: string;
}

// Type-only import histoire que pdf-lib (~250kb) reste 100% dynamic — il
// est chargé via `await import('@/lib/print/pdf-validator')` à la première
// sélection d'un PDF, jamais au load de la page.
import type { ValidationIssue } from '@/lib/print/pdf-validator';

// ─── Dropzone ─────────────────────────────────────────────────────────────

function Dropzone({
  label, kind, required, file, onChange, onClear, marginSpec, expectedDims,
}: {
  label: string;
  kind: 'front' | 'back';
  required: boolean;
  file: UploadedFile | null;
  onChange: (f: UploadedFile) => void;
  onClear: () => void;
  marginSpec: MarginSpec;
  expectedDims: ParsedSize | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Validation result : null = pas encore validé / pas un PDF, sinon
  // résultat affiché sous la dropzone. Si level=error on bloque l'upload.
  // Si level=warning on demande confirmation explicite avant upload.
  // Staging warning : PDF OU image (les deux exposent `issues` structurellement).
  const [pending, setPending] = useState<{ file: File; result: { issues: ValidationIssue[] } } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isUploaded = file !== null;
  const isUploading = progress !== null;

  async function handleFile(f: File) {
    setError(null);
    setPending(null);

    // Taille produit EXACTE (si résolue) → permet le hard-block dimension/DPI.
    const expected = expectedDims
      ? { widthInches: expectedDims.widthIn, heightInches: expectedDims.heightIn, bleedInches: marginSpec.bleedInches }
      : undefined;

    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    const isRaster = /^image\/(jpeg|png)$/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name);

    if (isPdf) {
      // Dynamic import : pdf-lib ~250kb, chargé seulement à la sélection d'un PDF.
      const { validatePdf } = await import('@/lib/print/pdf-validator');
      // strictDimensions : bloque une MAUVAISE taille — sûr car `expected` est la
      // taille EXACTE sélectionnée (sinon undefined → mismatch reste en warning).
      const result = await validatePdf(f, { expected, strictDimensions: Boolean(expected) });
      if (result.level === 'error') {
        setError(result.issues.map((i) => i.message).join(' '));
        return;
      }
      // Audit #4 — DPI des images EMBARQUÉES (pdfjs getOperatorList). Warning-only,
      // best-effort (ne throw/bloque jamais) : on ajoute aux avertissements affichés.
      const { assessPdfImageDpi } = await import('@/lib/print/pdf-image-dpi');
      const dpi = await assessPdfImageDpi(f);
      const issues = [...result.issues, ...dpi.issues];
      if (issues.length > 0) {
        setPending({ file: f, result: { issues } });
        return;
      }
    } else if (isRaster) {
      // Images raster (JPG/PNG) : vérif résolution (DPI à la taille d'impression).
      // AVANT : aucune validation → une image écran 72 DPI passait. Les formats pro
      // non décodables (AI/EPS/PSD/TIFF) passent (Sinalite reste le gate final).
      const { validateImage } = await import('@/lib/print/image-validator');
      const result = await validateImage(f, expected);
      if (result.level === 'error') {
        setError(result.issues.map((i) => i.message).join(' '));
        return;
      }
      if (result.level === 'warning') {
        setPending({ file: f, result });
        return;
      }
    }

    await doUpload(f);
  }

  async function doUpload(f: File) {
    setPending(null);
    setProgress({ pct: 0, filename: f.name });
    try {
      // Render thumbnail en parallèle avec l'upload S3 — pdfjs-dist (~1MB)
      // dynamic-imported, ne charge que la 1ère fois qu'un PDF est upload.
      // Si le render échoue (encrypted, malformed), retourne null → fallback
      // au preview text-only existant.
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      const thumbnailPromise = isPdf
        ? import('@/lib/print/pdf-thumbnail').then((m) => m.renderPdfThumbnail(f))
        : Promise.resolve(null);

      const [uploaded, thumbnailDataUrl] = await Promise.all([
        uploadFileToS3(f, kind, (pct) => setProgress({ pct, filename: f.name })),
        thumbnailPromise,
      ]);

      onChange({ ...uploaded, ...(thumbnailDataUrl ? { thumbnailDataUrl } : {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setProgress(null);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        background: dragging ? 'var(--accent-soft)' : 'var(--bg-canvas)',
        border: `2px ${isUploaded ? 'solid var(--success)' : dragging ? 'solid var(--accent-primary)' : 'dashed var(--border-default)'}`,
        borderRadius: 'var(--r-lg)',
        minHeight: 360,
        padding: 24,
        display: 'grid',
        gap: 16,
        transition: 'all var(--dur-fast) var(--ease-out)',
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
          <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}><Icon name="check" size={12} /> Validé</span>
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
          gap: 8,
        }}
      >
        {isUploading ? (
          <UploadingState progress={progress!} />
        ) : isUploaded ? (
          <UploadedPreview file={file!} label={label} marginSpec={marginSpec} />
        ) : (
          <EmptyState
            onClick={() => inputRef.current?.click()}
            dragging={dragging}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.ai,.eps,.psd,.jpg,.jpeg,.png,.tiff,application/pdf,application/postscript,image/vnd.adobe.photoshop,image/jpeg,image/png,image/tiff"
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-md)',
            fontSize: 12,
            color: 'var(--danger)',
          }}
        >
          <Icon name="alert" size={13} /> {error}
        </div>
      )}

      {pending && (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--warning-soft, #FFF6E5)',
            border: '1px solid var(--warning, #D97706)',
            borderRadius: 'var(--r-md)',
            fontSize: 12,
            color: 'var(--text-primary)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--warning, #D97706)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span><Icon name="alert" size={14} /></span>
            <span>{pending.result.issues.length} avertissement{pending.result.issues.length > 1 ? 's' : ''} sur ton fichier</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 4 }}>
            {pending.result.issues.map((issue, i) => (
              <li key={i} style={{ fontSize: 11.5, lineHeight: 1.5 }}>{issue.message}</li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--warning, #D97706)20', paddingTop: 8 }}>
            <button
              onClick={() => setPending(null)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}
            >
              Choisir un autre fichier
            </button>
            <button
              onClick={() => void doUpload(pending.file)}
              className="btn btn-secondary btn-sm"
              style={{ padding: '6px 12px' }}
            >
              Continuer quand même →
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        {isUploaded ? (
          <>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
              <Icon name="check" size={12} /> {file?.isTemplate ? 'design-template.pdf' : file?.name} {file && !file.isTemplate && file.size > 0 ? `· ${formatSize(file.size)}` : ''}
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
            onClick={() => inputRef.current?.click()}
            className="btn btn-secondary btn-sm"
            style={{ width: '100%' }}
            disabled={isUploading}
          >
            {isUploading ? 'Upload en cours…' : <><Icon name="clip" size={14} /> Choisir un fichier</>}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onClick, dragging }: { onClick: () => void; dragging: boolean }) {
  return (
    <>
      <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth={1.5}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, textAlign: 'center' }}>
        {dragging ? 'Lâche ici!' : 'Glisse ton fichier ici'}
      </div>
      <button
        onClick={onClick}
        style={{
          fontSize: 13,
          color: 'var(--accent-primary)',
          fontWeight: 600,
          textDecoration: 'underline',
          background: 'transparent',
          border: 0,
        }}
      >
        ou clique pour parcourir
      </button>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em', textAlign: 'center' }}>
        PDF · AI · EPS · PSD · JPG · PNG · TIFF · max 150 MB
      </div>
    </>
  );
}

function UploadingState({ progress }: { progress: UploadProgress }) {
  return (
    <div style={{ width: '100%', display: 'grid', placeItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 32 }}>⏳</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        {progress.filename}
      </div>
      <div style={{ width: '80%', height: 6, background: 'var(--bg-sunken)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${progress.pct}%`,
            height: '100%',
            background: 'var(--accent-primary)',
            transition: 'width 200ms ease',
          }}
        />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--accent-primary)', fontWeight: 600 }}>
        {progress.pct} %
      </div>
    </div>
  );
}

function UploadedPreview({
  file,
  label,
  marginSpec,
}: {
  file: UploadedFile;
  label: string;
  marginSpec: MarginSpec;
}) {
  // Si on a un thumbnail PDF rendu, affiche-le via PdfMarginOverlay qui
  // ajoute un toggle "Vérifier les marges" pour superposer bleed/trim/safe.
  // Sinon fallback au preview text-only.
  if (file.thumbnailDataUrl) {
    return (
      <PdfMarginOverlay
        thumbnailDataUrl={file.thumbnailDataUrl}
        filename={file.name}
        marginSpec={marginSpec}
      />
    );
  }

  // Fallback : preview text-only (non-PDF formats ou thumbnail render failed)
  return (
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
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
        {file.isTemplate ? `Design template — ${label}` : file.name}
      </div>
      <div style={{ width: 24, height: 1, background: 'var(--accent-primary)', margin: '4px 0' }} />
      <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 500 }}>
        {file.isTemplate ? 'Généré depuis ton template' : 'Fichier reçu'}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
        {file.url}
      </div>
    </div>
  );
}

function FileStatus({ label, file }: { label: string; file: UploadedFile | null }) {
  if (!file) {
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
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong>{label}</strong>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.isTemplate ? 'design-template.pdf' : file.name}
        </div>
      </div>
      <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, whiteSpace: 'nowrap' }}><Icon name="check" size={12} /></span>
    </div>
  );
}

// ─── S3 upload helper ─────────────────────────────────────────────────────

async function uploadFileToS3(
  file: File,
  kind: 'front' | 'back',
  onProgress: (pct: number) => void,
): Promise<UploadedFile> {
  // 1. Get presigned POST from our backend
  const presignRes = await fetch('/api/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      contentType: file.type || 'application/octet-stream',
      filename: file.name,
    }),
  });
  if (!presignRes.ok) {
    const data = await presignRes.json().catch(() => ({}));
    throw new Error(data.error ?? `Presign failed (${presignRes.status})`);
  }
  const { publicUrl, presigned } = await presignRes.json() as {
    publicUrl: string;
    presigned: { url: string; fields: Record<string, string> };
  };

  // 2. Build multipart form and POST to S3 with XHR for progress tracking
  // (fetch() doesn't support upload progress events in current browsers)
  await new Promise<void>((resolve, reject) => {
    const fd = new FormData();
    Object.entries(presigned.fields).forEach(([k, v]) => fd.append(k, v));
    fd.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      // S3 returns 204 No Content on successful POST
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 rejected upload (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
      }
    };
    xhr.onerror = () => reject(new Error('Erreur réseau pendant l\'upload'));
    xhr.open('POST', presigned.url);
    xhr.send(fd);
  });

  return {
    url: publicUrl,
    name: file.name,
    size: file.size,
    contentType: file.type || 'application/octet-stream',
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
