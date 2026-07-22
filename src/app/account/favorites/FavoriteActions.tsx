'use client';

/**
 * Actions inline pour une config sauvegardée : Utiliser / Renommer /
 * Organiser (folder + tags Round 18 #2) / Supprimer.
 *
 * "Utiliser" : POST /api/saved-configs/[id] qui bump le compteur + retourne
 *  l'URL deep-link vers le wizard.
 * "Organiser" : PUT /api/saved-configs/[id] avec folder?:string|null + tags?
 *  (CSV ou null pour clear). Datalist propose les folders existants.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Icon } from '@/components/ui/Icon';

interface Props {
  id: string;
  name: string;
  folder?: string | null;
  tags?: string | null;
  existingFolders?: string[];
}

export default function FavoriteActions({ id, name, folder, tags, existingFolders = [] }: Props) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [folderInput, setFolderInput] = useState(folder ?? '');
  const [tagsInput, setTagsInput] = useState(tags ?? '');
  // Round 41 #2 — Inline rename form (était window.prompt). Customer-facing,
  // donc mobile-critique. iOS prompt tronqué + no autofocus = friction.
  const [renaming, setRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState(name);

  async function use() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/saved-configs/${id}`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.url) window.location.href = data.url;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function openRename() {
    setRenameInput(name);
    setError(null);
    setRenaming(true);
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    const next = renameInput.trim();
    if (!next || next === name) {
      setRenaming(false);
      return;
    }
    setError(null);
    setRenaming(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/saved-configs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: next }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  async function saveOrganize() {
    setError(null);
    startTransition(async () => {
      try {
        const cleanFolder = folderInput.trim();
        const cleanTags = tagsInput.trim();
        const res = await fetch(`/api/saved-configs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folder: cleanFolder === '' ? null : cleanFolder,
            tags: cleanTags === '' ? null : cleanTags,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  async function remove() {
    if (!(await confirm({ title: `Supprimer « ${name} » ?`, confirmLabel: 'Supprimer', danger: true }))) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/saved-configs/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 8, minWidth: 240 }}>
        <input
          type="text"
          list={`folders-${id}`}
          placeholder="Dossier (ex: cartes-biz)"
          value={folderInput}
          onChange={(e) => setFolderInput(e.target.value)}
          maxLength={50}
          style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, background: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
        />
        <datalist id={`folders-${id}`}>
          {existingFolders.map((f) => <option key={f} value={f} />)}
        </datalist>
        <input
          type="text"
          placeholder="Tags séparés par virgule"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          maxLength={300}
          style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, background: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveOrganize} disabled={busy} style={{ flex: 1 }}>
            {busy ? '…' : 'Enregistrer'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={busy}>
            Annuler
          </button>
        </div>
        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>}
      </div>
    );
  }

  // Round 41 #2 — Rename mode (était window.prompt mobile-unusable).
  if (renaming) {
    return (
      <form onSubmit={submitRename} style={{ display: 'grid', gap: 8, minWidth: 240 }}>
        <label htmlFor={`favorite-rename-${id}`} style={{ fontSize: 11, fontWeight: 600 }}>
          Nouveau nom
        </label>
        <input
          id={`favorite-rename-${id}`}
          type="text"
          value={renameInput}
          onChange={(e) => setRenameInput(e.target.value)}
          maxLength={100}
          autoFocus
          required
          style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
          disabled={busy}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy} style={{ flex: 1 }}>
            {busy ? '…' : 'Renommer'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)} disabled={busy}>
            Annuler
          </button>
        </div>
        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>}
      </form>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {dialog}
      <button type="button" className="btn btn-primary btn-sm" onClick={use} disabled={busy} style={{ opacity: busy ? 0.5 : 1 }}>
        Utiliser →
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} disabled={busy} title="Organiser (dossier + tags)">
        <Icon name="folder" size={14} />
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={openRename} disabled={busy} title="Renommer">
        Renommer
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={busy} title="Supprimer" style={{ color: 'var(--danger)' }}>
        <Icon name="x" size={14} />
      </button>
      {error && <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>}
    </div>
  );
}
