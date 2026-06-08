'use client';

import { useState } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface KeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string; // CSV
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface Props {
  initialKeys: KeyRow[];
  availableScopes: { value: string; label: string }[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ApiKeysClient({ initialKeys, availableScopes }: Props) {
  const { confirm, dialog } = useConfirmDialog();
  const [keys, setKeys] = useState<KeyRow[]>(initialKeys);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleScope(s: string) {
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/account/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRevealed({ token: data.token, name: data.key.name });
      setKeys((cur) => [
        { ...data.key, lastUsedAt: null, revokedAt: null },
        ...cur,
      ]);
      setName('');
      setScopes([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(k: KeyRow) {
    const ok = await confirm({
      title: `Révoquer « ${k.name} » ?`,
      confirmLabel: 'Révoquer',
      danger: true,
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/account/api-keys/${k.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setKeys((cur) => cur.map((x) => (x.id === k.id ? { ...x, revokedAt: new Date().toISOString() } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function copyToken() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indispo : l'user copie à la main */
    }
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {dialog}

      {/* Token révélé UNE fois */}
      {revealed && (
        <div
          role="alert"
          style={{
            padding: 20,
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--success, #16a34a)',
            background: 'var(--success-soft, #f0fdf4)',
            display: 'grid',
            gap: 12,
          }}
        >
          <strong style={{ color: 'var(--success, #16a34a)' }}>✓ Clé « {revealed.name} » créée</strong>
          <p style={{ margin: 0, fontSize: 14 }}>
            Copie-la <strong>maintenant</strong> : par sécurité, elle ne sera <strong>plus jamais affichée</strong>.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code
              style={{
                flex: 1,
                minWidth: 240,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                padding: '10px 12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--r-sm)',
                wordBreak: 'break-all',
              }}
            >
              {revealed.token}
            </code>
            <button type="button" className="btn btn-primary btn-sm" onClick={copyToken}>
              {copied ? '✓ Copié' : 'Copier'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevealed(null)}>
              J&apos;ai copié, fermer
            </button>
          </div>
        </div>
      )}

      {/* Création */}
      <form onSubmit={createKey} className="card" style={{ display: 'grid', gap: 16 }}>
        <strong style={{ fontSize: 16 }}>Nouvelle clé</strong>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Nom (pour t&apos;y retrouver)
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Agent Claude, script n8n…"
            maxLength={80}
            required
            style={{ fontSize: 16, padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontFamily: 'inherit' }}
          />
        </label>
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Permissions
          </span>
          {availableScopes.map((s) => (
            <label key={s.value} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={scopes.includes(s.value)} onChange={() => toggleScope(s.value)} />
              <span><code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.value}</code> — {s.label}</span>
            </label>
          ))}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Sans permission, la clé peut seulement parcourir le catalogue et obtenir des devis (déjà public).
          </span>
        </fieldset>
        {error && <span role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</span>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Création…' : 'Créer la clé'}
          </button>
        </div>
      </form>

      {/* Liste */}
      <div style={{ display: 'grid', gap: 12 }}>
        <strong style={{ fontSize: 16 }}>Tes clés ({keys.filter((k) => !k.revokedAt).length} active{keys.filter((k) => !k.revokedAt).length > 1 ? 's' : ''})</strong>
        {keys.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Aucune clé pour l&apos;instant.</p>}
        {keys.map((k) => {
          const revoked = !!k.revokedAt;
          const scopeList = k.scopes ? k.scopes.split(',').filter(Boolean) : [];
          return (
            <div
              key={k.id}
              className="card"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', opacity: revoked ? 0.55 : 1 }}
            >
              <div style={{ display: 'grid', gap: 4, minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 15 }}>{k.name}</strong>
                  {revoked && <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Révoquée</span>}
                </div>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{k.keyPrefix}…</code>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Créée {fmtDate(k.createdAt)} · dernière utilisation {fmtDate(k.lastUsedAt)}
                  {scopeList.length > 0 && <> · {scopeList.join(', ')}</>}
                </span>
              </div>
              {!revoked && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(k)} style={{ color: 'var(--danger)' }}>
                  Révoquer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
