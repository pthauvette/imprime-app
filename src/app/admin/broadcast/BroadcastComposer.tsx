'use client';

/**
 * Composer broadcast email — formulaire admin avec preview count live.
 * Refresh le count à chaque changement de segment via /api/admin/broadcast?segment=.
 * Confirmation explicite avant send (modal).
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Segment = 'newsletter' | 'customers' | 'all';

const SEGMENT_LABELS: Record<Segment, string> = {
  newsletter: 'Newsletter (opt-in CASL express)',
  customers: 'Clients payants (24 derniers mois, opted-in)',
  all: 'Tous (newsletter + clients, dédupé)',
};

const SEGMENT_HINTS: Record<Segment, string> = {
  newsletter: 'Inscrits via le formulaire — consentement explicite, OK pour marketing.',
  customers: 'Clients avec >=1 commande payée dans 24 mois — relation commerciale CASL implied consent.',
  all: 'Union des deux. Évite si tu n\'as pas un message vraiment universel (cartes, livraison…).',
};

export default function BroadcastComposer() {
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>('newsletter');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [notes, setNotes] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    let aborted = false;
    setLoadingCount(true);
    setCount(null);
    fetch(`/api/admin/broadcast?segment=${segment}`)
      .then((r) => r.json())
      .then((data) => {
        if (aborted) return;
        if (data.ok) setCount(data.count);
      })
      .catch(() => {})
      .finally(() => {
        if (!aborted) setLoadingCount(false);
      });
    return () => { aborted = true; };
  }, [segment]);

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || count === null) return;
    const subj = subject.trim();
    const bod = body.trim();
    if (subj.length === 0 || bod.length < 20) {
      setError('Subject requis et body min 20 caractères.');
      return;
    }
    const confirmMsg =
      `Envoyer ce broadcast à ${count} destinataire${count > 1 ? 's' : ''} ?\n\n` +
      `Segment : ${SEGMENT_LABELS[segment]}\n` +
      `Sujet : ${subj}\n\n` +
      `Cette action est irréversible (les emails seront enqueued immédiatement).`;
    if (!window.confirm(confirmMsg)) return;

    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: subj,
            body: bod,
            segment,
            notes: notes.trim() || undefined,
            confirmedCount: count,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setDone(`✓ ${data.enqueued} email${data.enqueued > 1 ? 's' : ''} enqueued. Voir la queue dans /admin/emails.`);
        setSubject('');
        setBody('');
        setNotes('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <form
      onSubmit={handleSend}
      style={{
        padding: 24,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--r-xl)',
        display: 'grid',
        gap: 16,
        maxWidth: 760,
      }}
    >
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={labelStyle}>Segment</span>
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value as Segment)}
          style={inputStyle}
        >
          <option value="newsletter">{SEGMENT_LABELS.newsletter}</option>
          <option value="customers">{SEGMENT_LABELS.customers}</option>
          <option value="all">{SEGMENT_LABELS.all}</option>
        </select>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {SEGMENT_HINTS[segment]}
        </div>
        <div
          style={{
            marginTop: 4,
            padding: 10,
            background: count !== null && count > 0 ? 'var(--accent-soft)' : 'var(--bg-sunken)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            fontWeight: 600,
            color: count !== null && count > 0 ? 'var(--accent-primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {loadingCount ? '…' : count === null ? '—' : `${count} destinataire${count > 1 ? 's' : ''} estimés`}
        </div>
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={labelStyle}>Sujet</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          placeholder="Ex: Nouveau papier 18pt SOFT TOUCH dispo"
          style={inputStyle}
          required
        />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={labelStyle}>Body (texte brut, paragraphes séparés par ligne vide)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          minLength={20}
          maxLength={10000}
          rows={12}
          placeholder={'Salut,\n\nOn vient d\'ajouter le 18pt SOFT TOUCH au catalogue. Texture velours, fini matte premium — parfait pour les cartes de visite haut de gamme.\n\nVoir les détails : https://plio.ca/blog/...'}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          required
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {body.length} / 10 000 caractères · Texte brut, on wrappe dans le template responsive Plio.
        </div>
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={labelStyle}>Notes internes (optionnel — campagne, objectif…)</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          placeholder="Ex: launch SOFT TOUCH · phase 1 newsletter"
          style={inputStyle}
        />
      </label>

      {error && (
        <div role="alert" style={{ padding: 12, background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 'var(--r-sm)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {done && (
        <div role="status" style={{ padding: 12, background: 'var(--accent-soft)', color: 'var(--accent-primary)', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600 }}>
          {done}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || count === null || count === 0}
        className="btn btn-primary"
        style={{ opacity: busy || count === null || count === 0 ? 0.6 : 1 }}
      >
        {busy ? 'Envoi…' : count === null ? 'Calcul des destinataires…' : `📨 Envoyer à ${count} destinataire${count > 1 ? 's' : ''}`}
      </button>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
        ⚠️ Action irréversible. Les emails sont enqueués immédiatement et envoyés par le worker SES.
      </p>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-sm)',
  fontSize: 14,
  font: 'inherit',
  background: 'var(--bg-canvas)',
  color: 'var(--text-primary)',
};
