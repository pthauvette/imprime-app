/**
 * /sign-up — page d'inscription. Magic-link uniquement (auto-création du
 * User par PrismaAdapter au 1er click du link).
 *
 * Capture firstName/lastName/companyName + opt-in marketing via cookie
 * `plio_pending_profile` (15min TTL). Auth.js events.signIn lit le cookie
 * sur isNewUser pour populer le User row.
 *
 * Si l'user est déjà connecté, redirige vers /account.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { auth } from '@/auth';
import SignUpForm from '@/components/auth/SignUpForm';
import { Icon } from '@/components/ui/Icon';

export const metadata = { title: 'Créer un compte' };

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user) redirect('/account' as Route);

  return (
    <div className="auth-shell">
      {/* Form side LEFT */}
      <main className="auth-form-side">
        <div className="auth-form">
          <Link href={'/' as Route} className="auth-form-brand">Plio.</Link>
          <Link href={'/' as Route} className="auth-back">← Retour</Link>

          <h1>Crée ton compte, <em>imprime gratuitement.</em></h1>
          <p>2 minutes. Pas de carte de crédit. Premier devis offert.</p>

          <SignUpForm />
        </div>
      </main>

      {/* Editorial side RIGHT */}
      <aside className="auth-side">
        <div className="side-eyebrow">Bonus de bienvenue</div>
        <div>
          <h2 className="side-headline">25 $ <em>offerts</em> sur ta première commande.</h2>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '0 0 16px' }}>
            Code de bienvenue envoyé par courriel à l&apos;inscription — valable sur ta 1<sup>re</sup> commande de 100 $ et plus. Plus l&apos;accès aux templates et notre éditeur en ligne.
          </p>

          <div className="side-perks">
            <div className="side-perk">
              <div className="side-perk-icon"><Icon name="star" /></div>
              <div className="side-perk-text">
                <strong>Devis instantané, illimité</strong>
                <span>Configure n&apos;importe quel produit, vois le prix exact en temps réel.</span>
              </div>
            </div>
            <div className="side-perk">
              <div className="side-perk-icon"><Icon name="refresh" /></div>
              <div className="side-perk-text">
                <strong>Réutilise tes fichiers</strong>
                <span>On garde tes fichiers 90 jours — recommande en 2 clics, sans réuploader.</span>
              </div>
            </div>
            <div className="side-perk">
              <div className="side-perk-icon"><Icon name="edit" /></div>
              <div className="side-perk-text">
                <strong>Templates &amp; éditeur en ligne</strong>
                <span>Pas de design ? On a des templates et un éditeur en ligne.</span>
              </div>
            </div>
            <div className="side-perk">
              <div className="side-perk-icon">🇨🇦</div>
              <div className="side-perk-text">
                <strong>100 % imprimé au Canada</strong>
                <span>Livraison 1-7 jours via UPS et FedEx, partout au pays.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Round 45 #1 — « 12k+ resellers » et « 4,9 ★ Trustpilot » étaient
            inventés. Remplacés par des faits permanents ; « 2 min devis »
            reste (devis Sinalite réellement instantané). */}
        <div className="side-footer">
          <div className="side-footer-stat"><strong>🇨🇦</strong>Au Canada</div>
          <div className="side-footer-stat"><strong>0$</strong>avant paiement</div>
          <div className="side-footer-stat"><strong>2 min</strong>devis instantané</div>
        </div>
      </aside>
    </div>
  );
}
