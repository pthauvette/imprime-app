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
import SignInForm from '@/components/auth/SignInForm';

export const metadata = { title: 'Connexion — Plio' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;
  if (session?.user) redirect((callbackUrl ?? '/orders') as Route);

  return (
    <div className="auth-shell">
      <aside className="auth-side">
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
          <div className="auth-side-author">
            <div className="auth-side-avatar"></div>
            <div className="auth-side-author-info">
              <strong>Maxime Roy</strong>
              <span>Agence Boréal · Québec</span>
            </div>
          </div>
        </div>

        <div className="auth-side-stats">
          <div>
            <div className="auth-side-stat-num">12k+</div>
            <div className="auth-side-stat-label">resellers actifs</div>
          </div>
          <div>
            <div className="auth-side-stat-num">4,9</div>
            <div className="auth-side-stat-label">★ Trustpilot</div>
          </div>
          <div>
            <div className="auth-side-stat-num">2 min</div>
            <div className="auth-side-stat-label">devis moyen</div>
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

          <SignInForm callbackUrl={callbackUrl} />
        </div>
      </main>
    </div>
  );
}
