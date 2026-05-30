'use client';

/**
 * Éditeur de template — split-view :
 *   - LEFT : form avec un input par field editable du template
 *   - RIGHT : iframe qui affiche le PDF généré server-side (re-fetch debounced)
 *
 * On reste sur POST /api/templates/[slug]/render qui retourne un blob PDF —
 * via URL.createObjectURL on l'embed dans l'iframe. Pas besoin de PNG preview
 * ni de pdfme/ui côté client (lourd).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import type { AppTemplate } from '@/lib/templates/types';

interface Field {
  name: string;
  label: string;
  placeholder: string;
}

export default function DesignEditor({ template }: { template: AppTemplate }) {
  const router = useRouter();

  // Extract editable fields (skip readOnly like dividers/blocks)
  const fields: Field[] = useMemo(() => {
    const out: Field[] = [];
    for (const page of template.pdfme.schemas) {
      for (const f of page) {
        if (f.readOnly) continue;
        if (!('type' in f) || f.type !== 'text') continue;
        out.push({
          name: f.name,
          label: humanize(f.name),
          placeholder: template.sampleValues[f.name] ?? '',
        });
      }
    }
    return out;
  }, [template]);

  const [values, setValues] = useState<Record<string, string>>(() => ({ ...template.sampleValues }));
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  // Debounced re-render: 350ms after last keystroke
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void renderPreview();
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  async function renderPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${template.slug}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, mode: 'inline' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Revoke previous URL to free memory
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;
      setPdfUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur génération PDF');
    } finally {
      setLoading(false);
    }
  }

  function downloadPdf() {
    fetch(`/api/templates/${template.slug}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values, mode: 'attachment' }),
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.slug}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
  }

  async function addToCart() {
    setAdding(true);
    setError(null);
    try {
      // Finalize → DesignDraft persisté en DB avec le PDF généré
      const res = await fetch('/api/designs/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateSlug: template.slug, values }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { designId, productId } = await res.json();
      // Saute directement à /order/configure avec le produit pré-sélectionné +
      // le designId qui sera lu par /order/upload pour auto-fill le fichier
      router.push(
        `/order/configure?productId=${productId}&designId=${designId}` as Route,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur ajout au panier');
      setAdding(false);
    }
  }

  return (
    // Round 42 #2 — layout via .design-editor-grid so mobile (≤900px) collapses
    // to 1-col with canvas first (order:-1), form below. The inline 420px grid
    // was wider than a 375px viewport → canvas pushed off-screen.
    <div className="design-editor-grid">
      {/* ─── LEFT : form ─── */}
      <aside
        className="design-editor-controls"
        style={{
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          overflowY: 'auto',
        }}
      >
        <div>
          <Link
            href={'/templates' as Route}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            ← Templates
          </Link>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              margin: '12px 0 6px',
              fontWeight: 400,
            }}
          >
            {template.name}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            {template.description}
          </p>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {fields.map((f) => (
            <div key={f.name} className="field">
              <label htmlFor={f.name}>{f.label}</label>
              <input
                id={f.name}
                type="text"
                value={values[f.name] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                style={{
                  width: '100%',
                  border: 0,
                  background: 'transparent',
                  font: 'inherit',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          ))}
        </div>

        {error && (
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--r-md)',
              fontSize: 12,
              color: 'var(--danger)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'grid', gap: 8 }}>
          <button
            onClick={addToCart}
            disabled={adding}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {adding ? 'Ajout…' : 'Commander ces cartes →'}
          </button>
          <button
            onClick={downloadPdf}
            className="btn btn-ghost"
            style={{ width: '100%', fontSize: 13 }}
          >
            ↓ Télécharger le PDF
          </button>
        </div>

        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            paddingTop: 16,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          📐 {template.variant}" · CMYK 300 DPI · bleed 1/8" inclus
        </div>
      </aside>

      {/* ─── RIGHT : preview ─── */}
      <main
        style={{
          background: 'var(--bg-canvas)',
          display: 'grid',
          placeItems: 'center',
          padding: '40px',
          position: 'relative',
        }}
      >
        {pdfUrl ? (
          <iframe
            src={pdfUrl}
            title="Aperçu"
            style={{
              width: 'min(80%, 720px)',
              aspectRatio: '95.25 / 57.15',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-lg)',
              background: '#fff',
            }}
          />
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {loading ? 'Génération de l\'aperçu…' : 'En attente…'}
          </div>
        )}
        {loading && pdfUrl && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
              padding: '6px 10px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-pill)',
            }}
          >
            ⏳ Mise à jour…
          </div>
        )}
      </main>
    </div>
  );
}

function humanize(name: string): string {
  const map: Record<string, string> = {
    name: 'Nom complet',
    title: 'Titre / Poste',
    company: 'Entreprise',
    studio: 'Studio / Atelier',
    email: 'Email',
    phone: 'Téléphone',
    web: 'Site web',
    address: 'Adresse',
  };
  return map[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}
