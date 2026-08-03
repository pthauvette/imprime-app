/**
 * /sign-in — page de connexion. Server Component pour SEO/metadata, le form
 * lui-même est un Client Component (signIn() de next-auth/react).
 *
 * Si l'utilisateur est déjà connecté, redirige vers /orders.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { auth } from '@/auth';
import { safeInternalPath } from '@/lib/auth/safe-redirect';
import SignInChoice from '@/components/auth/SignInChoice';
import { smsAuthDisponible } from '@/lib/auth/twilio-verify';
import { Icon } from '@/components/ui/Icon';

export const metadata = { title: 'Connexion' };

/**
 * Mappe les codes d'erreur Auth.js (?error=) en message FR. Le plus fréquent est
 * `Verification` (lien magique expiré ou déjà utilisé — usage unique + TTL).
 */
function signInError(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'Verification':
      return 'Ce lien de connexion a expiré ou a déjà été utilisé. Demande-en un nouveau ci-dessous — on te le renvoie en quelques secondes.';
    case 'AccessDenied':
      return "Accès refusé. Si tu penses que c'est une erreur, écris-nous à bonjour@plio.ca.";
    case 'Configuration':
      return "Un souci technique nous empêche de te connecter pour l'instant. Réessaie dans un moment.";
    default:
      return 'La connexion a échoué. Réessaie en demandant un nouveau lien ci-dessous.';
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; email?: string }>;
}) {
  const session = await auth();
  const { callbackUrl, error, email } = await searchParams;
  const errorMessage = signInError(error);
  // Pré-remplit l'email si on revient du « Renvoyer un lien » (?email=).
  const initialEmail = email && email.includes('@') ? email : undefined;
  // SÉCURITÉ (Round 1 audit) : callbackUrl vient des searchParams (non fiable).
  // Sans validation, /sign-in?callbackUrl=https://evil.com redirige un user déjà
  // connecté HORS-SITE (open-redirect → phishing). On le sanitize en chemin
  // interne (fallback /orders) avant le redirect ET avant de le passer au form.
  const safeCallback = safeInternalPath(callbackUrl);
  if (session?.user) redirect(safeCallback as Route);

  return (
    <div className="auth-shell">
      {/* finding a11y 2026-08 — `auth-side--sombre` : globals.css contient DEUX
          définitions `.auth-side` de même spécificité (bloc signin.html l.1540 =
          dégradé sombre + texte clair ; bloc signup.html l.1967 = dégradé clair
          SANS redéfinir `color`). La seconde gagne par ordre source, donc cette
          page héritait d'un fond clair AVEC le texte clair de la première :
          « Plio. » mesuré à 1,00:1 (invisible) et le titre à 1,54:1. Le
          modificateur rétablit la paire fond+texte de façon explicite, sans
          toucher aux deux blocs legacy dont d'autres pages dépendent. */}
      <aside className="auth-side auth-side--sombre">
        <Link href={'/' as Route} className="auth-side-brand">Plio.</Link>

        <div>
          <div className="floating-cards">
            <div className="fc-card c1">
              <div className="fcn">Sophie Beauchamp</div>
              <div className="fcd"></div>
              <div className="fct">Directrice créative</div>
            </div>
            <div className="fc-card c2">
              <div className="fcn">Maison Verte</div>
              <div className="fcd"></div>
              <div className="fct">Architecture &amp; design</div>
            </div>
          </div>
          <p className="auth-side-quote">
            Le print qui prenait 3 jours prend maintenant <em>30 secondes.</em>
          </p>
        </div>

        {/* Round 45 #1 — « 12k+ resellers actifs » et « 4,9 ★ Trustpilot »
            étaient des chiffres inventés. Remplacés par des faits permanents
            vrais ; « 2 min devis » reste (devis Sinalite réellement instantané). */}
        <div className="auth-side-stats">
          <div>
            <div className="auth-side-stat-num">🇨🇦</div>
            <div className="auth-side-stat-label">Imprimé au Canada</div>
          </div>
          <div>
            <div className="auth-side-stat-num">0$</div>
            <div className="auth-side-stat-label">avant paiement</div>
          </div>
          <div>
            <div className="auth-side-stat-num">2 min</div>
            <div className="auth-side-stat-label">devis instantané</div>
          </div>
        </div>
      </aside>

      <main className="auth-form-side">
        <div className="auth-form">
          <Link href={'/' as Route} className="auth-form-brand">Plio.</Link>
          <Link href={'/' as Route} className="auth-back">← Retour</Link>

          <h1>
            Bon retour, <em>imprimeur.</em>
          </h1>
          <p>Connecte-toi pour reprendre où tu en étais.</p>

          {errorMessage && (
            <div
              role="alert"
              style={{
                margin: '0 0 20px',
                padding: '12px 14px',
                background: 'var(--danger-soft, #fef2f2)',
                border: '1px solid var(--danger, #dc2626)',
                borderRadius: 'var(--r-md, 10px)',
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--danger, #dc2626)',
              }}
            >
              <Icon name="alert" size={14} /> {errorMessage}
            </div>
          )}

          {/* La disponibilité du texto se décide CÔTÉ SERVEUR : elle dépend
              des variables Twilio et du drapeau SMS_AUTH, qui n'ont rien à
              faire dans le bundle client. Sans configuration, l'onglet
              n'apparaît pas du tout — plutôt que d'offrir un moyen de
              connexion qui répondrait 404. */}
          <SignInChoice
            callbackUrl={safeCallback}
            initialEmail={initialEmail}
            smsDisponible={smsAuthDisponible()}
          />
        </div>
      </main>
    </div>
  );
}
