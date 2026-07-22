'use client';

/**
 * Textarea pour les notes internes admin sur une commande.
 * Autosave debouncé (1.5s après dernière frappe) → PATCH /api/admin/orders/[id]/notes.
 *
 * Aucune action côté customer — c'est juste pour l'admin (notes de support,
 * suivi de réclamation, contexte que tu veux retrouver plus tard).
 */

import { useState, useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';

export default function AdminNotesPanel({
  orderId,
  initialNotes,
}: {
  orderId: string;
  initialNotes: string | null;
}) {
  const [value, setValue] = useState(initialNotes ?? '');
  const [savedValue, setSavedValue] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Audit admin 2026-07 §4.5 — sérialise les autosaves : sur réseau > 1,5 s,
  // deux PATCH pouvaient être en vol et le PREMIER (note tronquée) pouvait
  // arriver APRÈS le second → last-write-wins non garanti, panel affichant
  // « ✓ Sauvegardé » sur une note périmée. On aborte le fetch précédent.
  const abortRef = useRef<AbortController | null>(null);

  const dirty = value !== savedValue;

  useEffect(() => {
    if (!dirty) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void save();
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, dirty]);

  async function save() {
    // §4.5 — un seul PATCH en vol : le précédent est abandonné (sa réponse
    // périmée ne peut plus écraser l'état ni clore `saving` à tort).
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: value }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setSavedValue(value);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // remplacé par un save plus récent
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      if (!ctrl.signal.aborted) setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ex: Client appelé pour confirmer adresse · DM Sinalite envoyé"
        maxLength={5000}
        rows={4}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-sm)',
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: 'inherit',
          background: 'var(--bg-canvas)',
          resize: 'vertical',
          minHeight: 80,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        <span>{value.length} / 5000</span>
        <span>
          {error ? (
            <span style={{ color: 'var(--danger)' }}><Icon name="x" size={14} /> {error}</span>
          ) : saving ? (
            <span>Sauvegarde…</span>
          ) : dirty ? (
            <span>Modifications non sauvegardées</span>
          ) : value.length > 0 ? (
            <span style={{ color: 'var(--success, #16a34a)' }}><Icon name="check" size={14} /> Sauvegardé</span>
          ) : (
            <span>Visible uniquement aux admins</span>
          )}
        </span>
      </div>
    </div>
  );
}
