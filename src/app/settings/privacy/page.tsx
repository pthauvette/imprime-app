/**
 * /settings/privacy — Page PIPEDA/LPRPDE compliance pour customer.
 *
 * Server Component pour l'auth + le rendering des info. Les 2 actions
 * (download data export + request account deletion) sont gérées par
 * des Client Components.
 *
 * Use case : un user qui veut savoir ce qu'on stocke sur lui (PIPEDA art. 9)
 * ou qui veut supprimer son compte (art. 4.5 — Retention).
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { auth } from '@/auth';
import Sidebar from '@/components/account/Sidebar';
import DeleteAccountRequest from './DeleteAccountRequest';
import CookieConsentResetButton from '@/components/legal/CookieConsentResetButton';
import { Icon } from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Confidentialité' };

export default async function PrivacySettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/sign-in?callbackUrl=/settings/privacy' as Route);
  }

  return (
    <div className="acct-shell">
      <Sidebar active="/settings" />

      {/* Round 40 #2 — use .acct-main for mobile-friendly padding (was raw inline 96px horiz) */}
      <main className="acct-main" style={{ maxWidth: 800 }}>
        <header style={{ marginBottom: 32 }}>
          {/* Round 40 #2 — clamp instead of fixed 36px to avoid overflow on 375px */}
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 6vw, 36px)', fontWeight: 400, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Confidentialité &amp; données
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Plio applique la <a href="https://laws-lois.justice.gc.ca/fra/lois/p-8.6/" style={{ color: 'var(--accent-primary)' }} target="_blank" rel="noopener noreferrer">LPRPDE</a> (loi
            fédérale canadienne, équivalent PIPEDA / GDPR pour les organismes
            commerciaux). Tu as un droit d&apos;accès à tes données et de demande
            de suppression.
          </p>
        </header>

        {/* Data export */}
        <section
          style={{
            padding: 24,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 8px' }}>
                Exporter mes données
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                Télécharge un fichier JSON contenant toutes les données que Plio stocke
                sur toi : profil (incluant statut reseller, tier loyauté, opt-outs email),
                commandes, adresses, configurations sauvées, brouillons, parrainages,
                messages, avis publiés, historique wallet.
              </p>
            </div>
            <a
              href="/api/account/data-export"
              download
              className="btn btn-primary btn-sm"
            >
              <Icon name="download" size={14} /> Télécharger mes données (JSON)
            </a>
          </div>
        </section>

        {/* Email preferences shortcut */}
        <section
          style={{
            padding: 24,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 8px' }}>
                Préférences email
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                Tu peux désactiver les notifications de livraison (shipping,
                delivered). Les emails transactionnels essentiels (confirmation,
                annulation, remboursement) restent toujours actifs — ils sont
                nécessaires au service.
              </p>
            </div>
            <a href="/settings/email-preferences" className="btn btn-ghost btn-sm">
              Gérer →
            </a>
          </div>
        </section>

        {/* Round 26 #1 — Cookies banner reset */}
        <section
          style={{
            padding: 24,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 8px' }}>
                Bannière cookies
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                On utilise uniquement des cookies essentiels (session, panier, langue, parrainage). Pas de tracking publicitaire.
                Tu peux réinitialiser ton acquittement pour revoir la bannière au prochain chargement.
              </p>
            </div>
            <CookieConsentResetButton />
          </div>
        </section>

        {/* Delete account */}
        <section
          style={{
            padding: 24,
            background: 'var(--bg-surface)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-xl)',
          }}
        >
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 8px', color: 'var(--danger)' }}>
            Supprimer mon compte
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
            Demande la suppression définitive de ton compte. On vérifie manuellement
            ta demande (typique 1-2 jours ouvrables) puis on supprime toutes tes
            données — sauf l&apos;historique des commandes facturées (obligation de
            conservation 6 ans par la <a href="https://laws-lois.justice.gc.ca/fra/lois/I-3.3/page-87.html" style={{ color: 'var(--danger)' }} target="_blank" rel="noopener noreferrer">Loi
            de l&apos;impôt fédérale</a>).
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            <Icon name="alert" size={14} /> Action <strong>irréversible</strong> une fois traitée par l&apos;admin.
            Tu perds accès à : addresses, saved configs, drafts, crédits de
            parrainage non utilisés, statut reseller éventuel.
          </p>
          <DeleteAccountRequest />
        </section>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 32, lineHeight: 1.5 }}>
          Pour toute question, contactez notre commissaire à la protection des données à{' '}
          <a href="mailto:privacy@plio.ca" style={{ color: 'var(--accent-primary)' }}>privacy@plio.ca</a>.
        </p>
      </main>
    </div>
  );
}
