'use client';

/**
 * Bouton + modal pour envoyer un message custom au customer associé à
 * une commande. POST /api/admin/orders/[id]/message.
 *
 * Use case : besoin de demander un re-upload, clarifier l'adresse,
 * notifier d'un délai exceptionnel, etc. Sans avoir à ouvrir Gmail.
 *
 * Reply-To = email de l'admin connecté → le customer répond direct.
 */

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export default function SendCustomMessageButton({
  orderId,
  customerEmail,
}: {
  orderId: string;
  customerEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // Audit admin 2026-07 §4.1 — queueEmail retourne { sent:false } en HTTP 200
      // quand l'email est droppé (opt-out / suppression bounce / throttle). Avant,
      // on affichait « ✓ Envoyé » à tort et l'admin attendait une réponse qui ne
      // viendrait jamais. On garde le texte rédigé pour qu'il puisse le réutiliser.
      if (data.sent === false) {
        setFeedback({
          ok: false,
          message: `NON délivré à ${data.to ?? customerEmail} (opt-out, bounce ou throttle). Le client n'a rien reçu — contacte-le autrement.`,
        });
        return;
      }
      setFeedback({ ok: true, message: `Envoyé à ${data.to}` });
      // Reset après envoi réussi
      setSubject('');
      setBody('');
      setTimeout(() => {
        setOpen(false);
        setFeedback(null);
      }, 1500);
    } catch (err) {
      setFeedback({ ok: false, message: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-sm)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--text-primary)',
        }}
      >
        <Icon name="mail" /> Envoyer un message custom
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-canvas)',
        borderRadius: 'var(--r-lg)',
        padding: 24,
        width: '100%',
        maxWidth: 560,
        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        display: 'grid',
        gap: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>
            Message à <span style={{ color: 'var(--accent-primary)' }}>{customerEmail}</span>
          </h3>
          <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ fontSize: 18, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'grid', placeItems: 'center', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Le client recevra ton email avec un lien vers sa commande. Reply-To = ton email — les réponses te reviennent directement.
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Sujet</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="Ex: Question sur ton fichier"
            style={{ padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 14 }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={10000}
            rows={10}
            placeholder={"Bonjour,\n\nTon fichier semble être en basse résolution (150 dpi). Pour un résultat optimal, idéalement 300 dpi minimum.\n\nPeux-tu m'envoyer une version plus haute déf ? Tu peux re-upload directement sur la page de ta commande.\n\nMerci !"}
            style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical', minHeight: 200 }}
          />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
            {body.length} / 10000 — paragraphes séparés par lignes vides
          </div>
        </label>

        {feedback && (
          <div style={{
            padding: '8px 12px',
            background: feedback.ok ? 'var(--success-soft, #f0fdf4)' : 'var(--danger-soft)',
            border: `1px solid ${feedback.ok ? 'var(--success, #16a34a)' : 'var(--danger)'}`,
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            color: feedback.ok ? 'var(--success, #16a34a)' : 'var(--danger)',
          }}>
            {feedback.ok ? <Icon name="check" /> : <Icon name="x" />} {feedback.message}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button onClick={() => setOpen(false)} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Annuler
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{ padding: '8px 18px', background: canSend ? 'var(--accent-primary)' : 'var(--bg-sunken)', color: canSend ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: 'var(--r-sm)', cursor: canSend ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600 }}
          >
            {sending ? 'Envoi…' : 'Envoyer →'}
          </button>
        </div>
      </div>
    </div>
  );
}
