'use client';

/**
 * ExportImportActions — bouton Télécharger JSON + bouton Importer JSON
 * sur /account/favorites.
 *
 * Round 20 #4. Power-user data portability : backup avant deletion,
 * migrate dev→prod, partage entre comptes du même studio.
 */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export default function ExportImportActions() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleExport() {
    // Export = direct link download — pas de POST nécessaire.
    window.location.href = '/api/saved-configs/export';
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      setError(`Fichier trop gros (${Math.round(file.size / 1024)} KB > 500 KB max)`);
      e.target.value = '';
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const res = await fetch('/api/saved-configs/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setMessage(`✓ ${data.summary}`);
        setTimeout(() => router.refresh(), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur parsing JSON');
      } finally {
        if (e.target) e.target.value = '';
      }
    });
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={handleExport}
        className="btn btn-ghost btn-sm"
        disabled={busy}
        title="Télécharge tes configs en JSON pour backup ou partage"
      >
        <Icon name="download" size={14} /> Exporter JSON
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="btn btn-ghost btn-sm"
        disabled={busy}
        title="Importe un fichier JSON exporté précédemment (dédup auto)"
      >
        {busy ? 'Import…' : <><Icon name="upload" size={14} /> Importer JSON</>}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
      {error && (
        <span role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>
          {error}
        </span>
      )}
      {message && (
        <span role="status" style={{ fontSize: 12, color: 'var(--success, #16a34a)', fontWeight: 600 }}>
          {message}
        </span>
      )}
    </div>
  );
}
