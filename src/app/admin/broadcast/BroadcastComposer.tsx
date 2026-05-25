'use client';

/**
 * Composer broadcast email — formulaire admin avec preview count live,
 * preview HTML rendu, et bouton "envoyer un test à moi".
 *
 * Refresh le count à chaque changement de segment via /api/admin/broadcast?segment=.
 * Refresh le preview HTML 600ms après la dernière modif (debounce) via
 * /api/admin/broadcast/preview. Confirmation explicite avant send.
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Segment =
  | 'newsletter'
  | 'customers'
  | 'all'
  | 'tier-gold'
  | 'tier-silver'
  | 'tier-bronze'
  | 'inactive-90d';

const SEGMENT_OPTIONS: Array<{ key: Segment; label: string; hint: string }> = [
  {
    key: 'newsletter',
    label: 'Newsletter (opt-in CASL express)',
    hint: 'Inscrits via le formulaire — consentement explicite, OK pour marketing.',
  },
  {
    key: 'customers',
    label: 'Clients payants (24 mois, opted-in)',
    hint: 'Clients avec ≥1 commande payée dans 24 mois — implied consent CASL.',
  },
  {
    key: 'all',
    label: 'Tous (newsletter + clients)',
    hint: "Union dédupée. Évite si le message n'est pas universel.",
  },
  {
    key: 'tier-gold',
    label: 'Tier OR (≥ 2000 $ / 12 mois)',
    hint: 'Top clients — réserve aux annonces premium, perks, accès anticipé.',
  },
  {
    key: 'tier-silver',
    label: 'Tier ARGENT (≥ 500 $ / 12 mois)',
    hint: 'Clients fidèles — campagnes loyalty, nouveaux produits.',
  },
  {
    key: 'tier-bronze',
    label: 'Tier BRONZE actifs (24 mois)',
    hint: 'Petits clients récurrents — promos saisonnières, encouragements upgrade.',
  },
  {
    key: 'inactive-90d',
    label: 'Inactifs > 90 j (relance)',
    hint: 'Clients qui ont commandé mais pas dans les 90 derniers j — win-back.',
  },
];

const HINT_BY_KEY: Record<Segment, string> = Object.fromEntries(
  SEGMENT_OPTIONS.map((o) => [o.key, o.hint]),
) as Record<Segment, string>;

const LABEL_BY_KEY: Record<Segment, string> = Object.fromEntries(
  SEGMENT_OPTIONS.map((o) => [o.key, o.label]),
) as Record<Segment, string>;

export default function BroadcastComposer() {
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>('newsletter');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [notes, setNotes] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [testInfo, setTestInfo] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [testBusy, startTestTransition] = useTransition();
  // Round 19 #4 — scheduling. mode 'now' = immédiat (legacy), 'later'
  // affiche un datetime-local input. scheduledAt en ISO string (UTC).
  const [sendMode, setSendMode] = useState<'now' | 'later'>('now');
  const [scheduledLocal, setScheduledLocal] = useState('');

  // Live count quand segment change
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

  // Live preview HTML (debounce 600ms)
  useEffect(() => {
    if (subject.trim().length === 0 || body.trim().length < 10) {
      setPreviewHtml(null);
      return;
    }
    let aborted = false;
    setLoadingPreview(true);
    const timer = setTimeout(() => {
      fetch('/api/admin/broadcast/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (aborted) return;
          if (data.ok) setPreviewHtml(data.html);
        })
        .catch(() => {})
        .finally(() => {
          if (!aborted) setLoadingPreview(false);
        });
    }, 600);
    return () => {
      aborted = true;
      clearTimeout(timer);
    };
  }, [subject, body]);

  async function handleSendTest() {
    if (testBusy) return;
    const subj = subject.trim();
    const bod = body.trim();
    if (subj.length === 0 || bod.length < 20) {
      setError('Subject requis et body min 20 caractères pour envoyer un test.');
      return;
    }
    setError(null);
    setTestInfo(null);
    startTestTransition(async () => {
      try {
        const res = await fetch('/api/admin/broadcast/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: subj, body: bod }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setTestInfo(`✓ Test envoyé à ${data.sentTo} — vérifie ton inbox.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur envoi test');
      }
    });
  }

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || count === null) return;
    const subj = subject.trim();
    const bod = body.trim();
    if (subj.length === 0 || bod.length < 20) {
      setError('Subject requis et body min 20 caractères.');
      return;
    }
    // Round 19 #4 — scheduling : si sendMode=later, valider le datetime
    let scheduledIso: string | undefined;
    if (sendMode === 'later') {
      if (!scheduledLocal) {
        setError('Choisis une date/heure pour programmer.');
        return;
      }
      const dt = new Date(scheduledLocal);
      if (Number.isNaN(dt.getTime())) {
        setError('Date/heure invalide.');
        return;
      }
      if (dt.getTime() < Date.now() + 60_000) {
        setError('Date doit être dans au moins 1 min dans le futur.');
        return;
      }
      scheduledIso = dt.toISOString();
    }

    const action = sendMode === 'later' ? 'programmer' : 'envoyer maintenant';
    const confirmMsg =
      `${sendMode === 'later' ? 'Programmer' : 'Envoyer'} ce broadcast à ${count} destinataire${count > 1 ? 's' : ''} ?\n\n` +
      `Segment : ${LABEL_BY_KEY[segment]}\n` +
      `Sujet : ${subj}\n` +
      (scheduledIso ? `Quand : ${new Date(scheduledIso).toLocaleString('fr-CA')}\n\n` : '\n') +
      `Cette action est irréversible (${sendMode === 'later' ? 'le broadcast sera processé par le cron à l\'heure indiquée' : 'les emails seront enqueued immédiatement'}).`;
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
            scheduledAt: scheduledIso,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.scheduled) {
          setDone(`✓ Broadcast programmé pour ${new Date(data.scheduledAt).toLocaleString('fr-CA')} (~${data.plannedRecipients} destinataires).`);
        } else {
          setDone(`✓ ${data.enqueued} email${data.enqueued > 1 ? 's' : ''} enqueued. Voir la queue dans /admin/emails.`);
        }
        setSubject('');
        setBody('');
        setNotes('');
        setPreviewHtml(null);
        setSendMode('now');
        setScheduledLocal('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    /* Round 40 #2 — layout via .admin-composer-preview-grid (migrated-pages.css);
       collapses to 1-col at < 900px so each panel gets full width on mobile. */
    <div className="admin-composer-preview-grid" style={{ alignItems: 'start' }}>
      <form
        onSubmit={handleSend}
        style={{
          padding: 24,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-xl)',
          display: 'grid',
          gap: 16,
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={labelStyle}>Segment</span>
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value as Segment)}
            style={inputStyle}
          >
            {SEGMENT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {HINT_BY_KEY[segment]}
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

        {testInfo && (
          <div role="status" style={{ padding: 12, background: 'var(--info-soft, var(--accent-soft))', color: 'var(--info, var(--accent-primary))', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600 }}>
            {testInfo}
          </div>
        )}

        {done && (
          <div role="status" style={{ padding: 12, background: 'var(--accent-soft)', color: 'var(--accent-primary)', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600 }}>
            {done}
          </div>
        )}

        {/* Round 19 #4 — Schedule controls */}
        <div style={{ display: 'grid', gap: 8, padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)' }}>
          <span style={labelStyle}>Quand envoyer ?</span>
          <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="sendMode"
                checked={sendMode === 'now'}
                onChange={() => setSendMode('now')}
                disabled={busy}
              />
              Maintenant
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="sendMode"
                checked={sendMode === 'later'}
                onChange={() => setSendMode('later')}
                disabled={busy}
              />
              Programmer pour…
            </label>
          </div>
          {sendMode === 'later' && (
            <input
              type="datetime-local"
              value={scheduledLocal}
              onChange={(e) => setScheduledLocal(e.target.value)}
              disabled={busy}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--r-sm)',
                fontSize: 13,
                fontFamily: 'var(--font-mono)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
          )}
          {sendMode === 'later' && scheduledLocal && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Précision cron : ±5 min. Le broadcast sera processé au prochain tick après cette heure.
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleSendTest}
            disabled={testBusy || subject.trim().length === 0 || body.trim().length < 20}
            className="btn btn-secondary"
            style={{ opacity: testBusy ? 0.6 : 1 }}
          >
            {testBusy ? 'Envoi test…' : '✉ Envoyer un test à moi'}
          </button>
          <button
            type="submit"
            disabled={busy || count === null || count === 0}
            className="btn btn-primary"
            style={{ opacity: busy || count === null || count === 0 ? 0.6 : 1, flex: 1, minWidth: 200 }}
          >
            {busy
              ? (sendMode === 'later' ? 'Programmation…' : 'Envoi…')
              : count === null
                ? 'Calcul…'
                : sendMode === 'later'
                  ? `📅 Programmer pour ${count} destinataire${count > 1 ? 's' : ''}`
                  : `📨 Envoyer à ${count} destinataire${count > 1 ? 's' : ''}`}
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
          ⚠️ Action irréversible. {sendMode === 'later' ? 'Le broadcast sera processé par le cron à l\'heure indiquée.' : 'Les emails sont enqueués immédiatement.'}
        </p>
      </form>

      {/* Preview pane — rendu HTML exact de l'email */}
      <div style={{
        padding: 16,
        background: 'var(--bg-sunken)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--r-xl)',
        position: 'sticky',
        top: 24,
        maxHeight: 'calc(100vh - 48px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}>
          <h3 style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 600,
            margin: 0,
          }}>
            Preview email
          </h3>
          {loadingPreview && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Render…</span>
          )}
        </div>

        {previewHtml ? (
          <iframe
            title="Preview broadcast"
            srcDoc={previewHtml}
            style={{
              width: '100%',
              height: '70vh',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)',
              background: '#ffffff',
            }}
          />
        ) : (
          <div style={{
            padding: '64px 24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
            background: 'var(--bg-surface)',
            borderRadius: 'var(--r-md)',
          }}>
            Tape un sujet + au moins 10 caractères de body — le preview HTML
            apparaîtra ici.
          </div>
        )}
      </div>
    </div>
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
