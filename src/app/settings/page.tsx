/**
 * /settings — Server Component lisant le profil user pour affichage read-only.
 *
 * MVP : on affiche les infos (nom, email, téléphone) sans formulaire d'édition.
 * La page /settings/email-preferences existe déjà pour gérer les opt-ins email.
 *
 * Out of scope MVP :
 *   - Édition inline du profil (firstName/lastName/phone) — bouton désactivé
 *   - Suppression GDPR/Loi 25 — bouton désactivé avec tooltip
 *   - Gestion des sessions actives
 *   - 2FA / TOTP / FIDO2
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Paramètres — Plio' };

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in?callbackUrl=/settings' as Route);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      createdAt: true,
      emailDeliveryNotifications: true,
    },
  });

  if (!user) redirect('/sign-in?callbackUrl=/settings' as Route);

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || '—';

  return (
    <div className="acct-shell">
      <Sidebar active="/settings" />

      <main className="acct-main">
        <div className="page-header">
          <div>
            <h1 className="page-title">Paramètres</h1>
            <p className="page-subtitle">
              Membre depuis {formatDate(user.createdAt)} · {user.email}
            </p>
          </div>
        </div>

        {/* Profil */}
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-header">
            <h2 className="panel-title">Informations personnelles</h2>
            <button
              className="panel-action"
              disabled
              title="Édition à venir — bouton non actif pour MVP"
              style={{
                opacity: 0.5,
                cursor: 'not-allowed',
                background: 'transparent',
                border: 'none',
              }}
            >
              Modifier
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gap: 16,
              padding: '16px 0',
            }}
          >
            <KV label="Nom complet" value={fullName} />
            <KV label="Courriel" value={user.email} />
            <KV label="Téléphone" value={user.phone ?? '—'} />
            <KV label="Membre depuis" value={formatDate(user.createdAt)} />
          </div>
        </div>

        {/* Préférences email */}
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-header">
            <h2 className="panel-title">Préférences email</h2>
          </div>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-muted)',
              margin: '8px 0 16px',
              lineHeight: 1.5,
            }}
          >
            Choisis quelles notifications de livraison tu reçois. Les confirmations de
            commande et les emails transactionnels restent toujours activés (CASL).
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--bg-canvas)',
              borderRadius: 'var(--r-md)',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <strong style={{ display: 'block', color: 'var(--text-primary)' }}>
                Notifications de livraison
              </strong>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Statut actuel : {user.emailDeliveryNotifications ? 'Activées' : 'Désactivées'}
              </span>
            </div>
            <Link
              href={'/settings/email-preferences' as Route}
              className="btn btn-secondary"
              style={{ textDecoration: 'none' }}
            >
              Gérer →
            </Link>
          </div>
        </div>

        {/* Zone dangereuse */}
        <div
          className="panel"
          style={{
            borderColor: 'var(--danger-soft, var(--border-default))',
            background: 'var(--danger-soft, var(--bg-surface))',
          }}
        >
          <div className="panel-header">
            <h2 className="panel-title" style={{ color: 'var(--danger)' }}>
              Zone dangereuse
            </h2>
          </div>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-muted)',
              margin: '8px 0 16px',
              lineHeight: 1.5,
            }}
          >
            Actions irréversibles. Si tu supprimes ton compte, tes données seront
            effacées conformément à la Loi 25 (Québec) et au GDPR.
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--bg-canvas)',
              borderRadius: 'var(--r-md)',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <strong style={{ display: 'block', color: 'var(--text-primary)' }}>
                Supprimer mon compte
              </strong>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Toutes tes données seront effacées sous 30 jours.
              </span>
            </div>
            <button
              disabled
              title="GDPR/Loi 25 deletion à wirer"
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r-md)',
                background: 'var(--danger)',
                color: 'white',
                fontWeight: 600,
                fontSize: 13,
                border: 'none',
                opacity: 0.5,
                cursor: 'not-allowed',
              }}
            >
              Supprimer mon compte
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr',
        gap: 16,
        alignItems: 'baseline',
        padding: '8px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 15, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
