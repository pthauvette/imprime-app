/**
 * /settings — Server Component : profil user + rectification self-serve.
 *
 * Édition du profil (prénom/nom/téléphone) via <EditProfileForm> → Server Action
 * updateProfile (Loi 25 art. 27, droit de rectification). Le courriel reste
 * read-only ici (identité d'auth magic-link). Les opt-ins email vivent dans
 * /settings/email-preferences.
 *
 * Suppression GDPR/Loi 25 : gérée par le flux dédié /settings/privacy
 * (<DeleteAccountRequest> → POST /api/account/delete-request). Le bouton
 * « Supprimer mon compte » de cette page y renvoie (pas de duplication).
 *
 * Out of scope MVP :
 *   - Changement de courriel (= re-vérification du magic-link)
 *   - Gestion des sessions actives
 *   - 2FA / TOTP / FIDO2
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import EditProfileForm from '@/components/account/EditProfileForm';
import PhoneVerifyPanel from '@/components/account/PhoneVerifyPanel';
import { smsAuthDisponible } from '@/lib/auth/twilio-verify';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Paramètres' };

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
      phoneVerified: true,
      createdAt: true,
      emailDeliveryNotifications: true,
    },
  });

  if (!user) redirect('/sign-in?callbackUrl=/settings' as Route);

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

        {/* Connexion par texto — panneau rendu UNIQUEMENT si la fonctionnalité
            est configurée (décision côté serveur : les variables Twilio n'ont
            rien à faire dans le bundle client). C'est le SEUL chemin par lequel
            un compte créé avant cette fonctionnalité peut obtenir un numéro
            vérifié, donc se connecter par texto. */}
        {smsAuthDisponible() && (
          <div className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-header">
              <h2 className="panel-title">Connexion par texto</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Vérifie ton numéro pour pouvoir te connecter par code SMS, en plus
              du lien par courriel.
            </p>
            {/* On ne passe que le numéro MASQUÉ : le complet n'a aucune raison
                de traverser jusqu'au navigateur (Loi 25). */}
            <PhoneVerifyPanel
              numeroActuel={user.phoneVerified ? `••• ••• ${user.phoneVerified.slice(-4)}` : null}
            />
          </div>
        )}

        {/* Profil */}
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-header">
            <h2 className="panel-title">Informations personnelles</h2>
          </div>

          {/* Rectification self-serve (Loi 25 art. 27) — prénom/nom/téléphone. */}
          <EditProfileForm
            initial={{
              firstName: user.firstName ?? '',
              lastName: user.lastName ?? '',
              phone: user.phone ?? '',
            }}
          />

          {/* Lecture seule : le courriel = identité d'auth (non éditable ici). */}
          <div style={{ display: 'grid', gap: 16, padding: '20px 0 0' }}>
            <KV label="Courriel" value={user.email} />
            <KV label="Membre depuis" value={formatDate(user.createdAt)} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
            Pour changer ton courriel, écris-nous à{' '}
            <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a>{' '}
            (il sert d&apos;identifiant de connexion).
          </p>
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
            {/* La suppression (Loi 25 / GDPR) est gérée par le flux dédié sous
                /settings/privacy → <DeleteAccountRequest> → POST
                /api/account/delete-request. On y renvoie au lieu de dupliquer le
                formulaire ici (un seul point de vérité, et le flux a déjà la
                confirmation + le délai de 30 j). */}
            <Link
              href={'/settings/privacy' as Route}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r-md)',
                background: 'var(--danger)',
                color: 'white',
                fontWeight: 600,
                fontSize: 13,
                border: 'none',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Supprimer mon compte
            </Link>
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
      className="settings-2col-grid"
      style={{
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
