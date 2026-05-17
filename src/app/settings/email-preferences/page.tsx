/**
 * /settings/email-preferences — gestion CASL des préférences email.
 *
 * Cible des liens "Se désabonner" dans les footers des emails. Permet :
 *   - Opt-out des delivery notifications (shipped, delivered) — opt-able
 *   - Voir la liste des emails transactionnels jamais opt-out (magic link,
 *     confirmation order, cancellation, refund) — REQUIS par le service
 *
 * Server Action sur le toggle pour persist en DB instantanément.
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import type { Route } from 'next';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import Sidebar from '@/components/account/Sidebar';

export const metadata = { title: 'Préférences email — Plio' };
export const dynamic = 'force-dynamic';

async function toggleDeliveryNotifications(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  const enabled = formData.get('enabled') === 'true';
  await prisma.user.update({
    where: { id: session.user.id },
    data: { emailDeliveryNotifications: enabled },
  });
  revalidatePath('/settings/email-preferences');
}

export default async function EmailPreferencesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/sign-in?callbackUrl=/settings/email-preferences' as Route);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailDeliveryNotifications: true },
  });
  if (!user) {
    redirect('/sign-in' as Route);
  }

  return (
    <div className="acct-shell">
      <Sidebar active="/settings" />

      <main className="acct-main" style={{ padding: '56px 64px', maxWidth: 840 }}>
        <Link
          href={'/settings' as Route}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 600,
            textDecoration: 'none',
            marginBottom: 16,
            display: 'inline-block',
          }}
        >
          ← Tous les paramètres
        </Link>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(40px, 5vw, 64px)',
            letterSpacing: '-0.025em',
            margin: '0 0 8px',
            fontWeight: 400,
          }}
        >
          Préférences <em style={{ color: 'var(--accent-primary)' }}>email.</em>
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-muted)', margin: '0 0 48px' }}>
          On envoie le minimum. Tu peux désactiver les notifications de livraison ci-dessous.
          Les emails liés à ton compte ou à une commande active restent toujours envoyés (requis par le service).
        </p>

        {/* ─── Opt-able section ──────────────────────────────────── */}
        <section
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
            padding: 32,
            marginBottom: 24,
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 24,
              letterSpacing: '-0.01em',
              margin: '0 0 24px',
              fontWeight: 400,
            }}
          >
            Notifications optionnelles
          </h2>

          <form action={toggleDeliveryNotifications}>
            <PreferenceRow
              title="Notifications de livraison"
              description="Email quand ta commande est expédiée et quand elle est livrée."
              enabled={user.emailDeliveryNotifications}
            />
          </form>
        </section>

        {/* ─── Required section ──────────────────────────────────── */}
        <section
          style={{
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
            padding: 32,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            ⚠ Toujours actifs · requis par le service
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14 }}>
            <RequiredRow
              title="Lien magique de connexion"
              description="Envoyé quand tu te connectes. Sans ça, tu ne peux pas accéder à ton compte."
            />
            <RequiredRow
              title="Confirmation de commande"
              description="Envoyé après chaque paiement. Reçu officiel + détails de la commande."
            />
            <RequiredRow
              title="Annulation ou remboursement"
              description="Envoyé si une commande est annulée ou remboursée."
            />
          </ul>
        </section>

        {/* ─── Info banner ───────────────────────────────────────── */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--accent-soft)',
            borderRadius: 'var(--r-md)',
            fontSize: 13,
            color: 'var(--text-primary)',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <span>✱</span>
          <span>
            <strong>Compte concerné :</strong> {user.email}
            <br />
            Pour changer l'adresse, va dans{' '}
            <Link href={'/settings' as Route} style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>
              Paramètres du compte
            </Link>.
          </span>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function PreferenceRow({
  title, description, enabled,
}: {
  title: string;
  description: string;
  enabled: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 16,
        alignItems: 'center',
        padding: '8px 0',
      }}
    >
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
      <button
        type="submit"
        name="enabled"
        value={enabled ? 'false' : 'true'}
        style={{
          padding: '8px 16px',
          borderRadius: 'var(--r-pill)',
          border: `1px solid ${enabled ? 'var(--success)' : 'var(--border-default)'}`,
          background: enabled ? 'var(--success-soft)' : 'var(--bg-surface)',
          color: enabled ? 'var(--success)' : 'var(--text-muted)',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {enabled ? '✓ Activé' : '✕ Désactivé'}
      </button>
    </div>
  );
}

function RequiredRow({ title, description }: { title: string; description: string }) {
  return (
    <li>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        {description}
      </div>
    </li>
  );
}
