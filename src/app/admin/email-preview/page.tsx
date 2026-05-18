/**
 * /admin/email-preview — Aperçu live des 11 templates email transactionnels.
 *
 * Workflow admin :
 *   1. Choisir un template dans le dropdown (form GET)
 *   2. Modifier les vars en JSON (textarea) ou utiliser les sample vars
 *   3. Cliquer "Aperçu" → iframe srcDoc avec le HTML rendu
 *   4. Cliquer "Envoyer test à moi" → reçoit l'email dans sa propre boîte
 *      pour valider sur un vrai client mail (Gmail, Outlook, iOS Mail…)
 *
 * Server Component : on rend l'email server-side via renderEmail puis on
 * passe le HTML au Client Component qui l'injecte dans `<iframe srcDoc=...>`.
 * srcDoc isole les CSS de l'email du admin CSS — comportement comme un vrai
 * client mail.
 *
 * Use case principal : avant un broadcast ou un changement de template, on
 * veut visualiser sans devoir wait que le webhook trigger.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { auth } from '@/auth';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { renderEmail, EMAIL_SUBJECTS, type EmailTemplate } from '@/lib/emails/render';
import { ALL_TEMPLATES, getSampleVars } from '@/lib/emails/sample-vars';
import EmailPreviewForm from './EmailPreviewForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Aperçu emails · Plio' };

const TEMPLATE_LABELS: Record<EmailTemplate, string> = {
  'magic-link': 'Magic link (sign-in)',
  'welcome': 'Bienvenue (nouveau user)',
  'order-confirmation': 'Confirmation commande',
  'order-shipped': 'Expédition (SHIPPED)',
  'order-delivered': 'Livraison (DELIVERED)',
  'order-cancelled': 'Annulation + refund',
  'payment-failed': 'Paiement échoué',
  'refund-issued': 'Refund partiel/full',
  'admin-custom-message': 'Message admin (custom)',
  'admin-daily-summary': 'Résumé quotidien admin',
  'reengagement-follow-up': 'Re-engagement (7j post-delivery)',
  'reengagement-winback': 'Win-back (90j inactif)',
};

interface SearchParams {
  template?: string;
  vars?: string;
}

export default async function EmailPreviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    redirect('/sign-in?callbackUrl=/admin/email-preview' as Route);
  }

  const params = await searchParams;
  const template = (
    ALL_TEMPLATES.includes(params.template as EmailTemplate)
      ? params.template
      : 'order-confirmation'
  ) as EmailTemplate;

  // Vars : soit posté en query (édition admin), soit fallback sample vars
  let vars: Record<string, string | number>;
  let varsError: string | null = null;
  if (params.vars) {
    try {
      const parsed = JSON.parse(params.vars) as unknown;
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Doit être un objet JSON');
      }
      vars = parsed as Record<string, string | number>;
    } catch (err) {
      varsError = err instanceof Error ? err.message : 'JSON invalide';
      vars = getSampleVars(template);
    }
  } else {
    vars = getSampleVars(template);
  }

  // Render le HTML server-side. Si une var est manquante (template attend
  // {{FOO}} mais on l'a pas dans vars), renderEmail substitue par "" et
  // strip les {{}} restants — donc safe.
  let html: string;
  let renderError: string | null = null;
  try {
    html = renderEmail(template, vars);
  } catch (err) {
    html = '<p style="color:#dc2626;font-family:system-ui;padding:20px">Erreur de rendu : ' +
      (err instanceof Error ? err.message : 'inconnue') + '</p>';
    renderError = err instanceof Error ? err.message : 'Erreur rendu';
  }

  const subject = EMAIL_SUBJECTS[template](vars);

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="email-preview"
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? '',
          role: session.user.role ?? 'USER',
        }}
      />

      <main className="adm-main" style={{ padding: '40px 48px 80px' }}>
        <header style={{ marginBottom: 32 }}>
          <div className="page-eyebrow">Aperçu emails</div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 40,
              letterSpacing: '-0.025em',
              fontWeight: 400,
              margin: '8px 0 8px',
            }}
          >
            Aperçu des templates
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Rendu live des 11 templates transactionnels. Modifie les vars en JSON ou
            envoie-toi un test pour valider sur un vrai client mail.
          </p>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '380px 1fr',
            gap: 32,
            alignItems: 'start',
          }}
        >
          {/* Form (left column) */}
          <div style={{ position: 'sticky', top: 24, display: 'grid', gap: 16 }}>
            <form method="GET" style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  Template
                </span>
                <select
                  name="template"
                  defaultValue={template}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--r-sm)',
                    fontSize: 14,
                    background: 'var(--bg-surface)',
                  }}
                >
                  {ALL_TEMPLATES.map((t) => (
                    <option key={t} value={t}>
                      {TEMPLATE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-ghost" style={{ width: 'fit-content' }}>
                Recharger sample vars →
              </button>
            </form>

            <EmailPreviewForm
              template={template}
              initialVars={vars}
              varsError={varsError}
              subject={subject}
            />

            {renderError && (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'var(--danger-soft, #fef2f2)',
                  border: '1px solid var(--danger, #dc2626)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13,
                  color: 'var(--danger, #dc2626)',
                }}
              >
                ⚠ Rendu KO : {renderError}
              </div>
            )}
          </div>

          {/* Iframe preview (right column) */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-lg)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-sunken)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span>
                <strong style={{ color: 'var(--text-primary)' }}>Sujet :</strong> {subject}
              </span>
              <span>
                {(html.length / 1024).toFixed(1)} kB · {template}
              </span>
            </div>
            {/* sandbox sans allow-scripts : pas de JS exécuté, pas de form */}
            <iframe
              srcDoc={html}
              sandbox=""
              title={`Aperçu ${template}`}
              style={{
                width: '100%',
                height: 'calc(100vh - 240px)',
                minHeight: 600,
                border: 'none',
                background: '#fff',
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
