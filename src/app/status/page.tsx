/**
 * /status — page publique d'état du système.
 *
 * Server Component qui fetch /api/health (interne, server-side, ~10ms),
 * affiche un dashboard simple : status global + status par dépendance.
 *
 * Auto-revalidate toutes les 30s côté Next.js (revalidate prop). Bouton
 * "Rafraîchir" pour forcer un check immédiat (form GET avec un timestamp
 * param qui bust le cache).
 *
 * Public — pas d'auth requise. C'est exactement le but : que tes clients
 * + UptimeRobot puissent voir d'un coup d'œil si quelque chose cloche.
 */

import Link from 'next/link';
import type { Route } from 'next';

export const metadata = {
  title: 'État du système — Plio',
  description: 'État en temps réel des composants Plio : base de données, API impression, paiements. Si quelque chose cloche, c\'est ici.',
};

export const dynamic = 'force-dynamic';

interface HealthResponse {
  status: 'pass' | 'warn' | 'fail';
  version?: string;
  releaseId?: string;
  timestamp: string;
  totalLatencyMs?: number;
  checks: Record<string, { status: 'pass' | 'fail'; latencyMs: number; error?: string }>;
}

const STATUS_LABELS: Record<HealthResponse['status'], string> = {
  pass: 'Tous les systèmes opérationnels',
  warn: 'Service dégradé',
  fail: 'Incident en cours',
};

const STATUS_COLORS: Record<HealthResponse['status'], string> = {
  pass: 'var(--success, #16a34a)',
  warn: 'var(--warning, #D97706)',
  fail: 'var(--danger)',
};

const CHECK_LABELS: Record<string, { name: string; desc: string }> = {
  'db:postgres': {
    name: 'Base de données',
    desc: 'Stocke les commandes, utilisateurs et configurations sauvegardées.',
  },
  'api:sinalite': {
    name: 'API d\'impression',
    desc: 'Notre presse partenaire. Si down, les commandes ne peuvent pas être soumises (mais le site reste browse-able).',
  },
  'api:stripe': {
    name: 'Paiements',
    desc: 'Processeur de paiement. Si down, le checkout ne peut pas finaliser les achats.',
  },
  'email:queue': {
    name: 'Envoi d\'emails',
    desc: 'Queue d\'envoi pour confirmations, expéditions, factures. Alerte si > 10 emails en échec dans la dernière heure.',
  },
  'webhooks:recent': {
    name: 'Webhooks récents',
    desc: 'Notifications Stripe + Sinalite. Alerte si > 5 échecs dans les 15 dernières minutes.',
  },
};

async function fetchHealth(): Promise<HealthResponse | null> {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    const res = await fetch(`${url}/api/health?ts=${Date.now()}`, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const health = await fetchHealth();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 96px' }}>
      <nav style={{ marginBottom: 24, fontSize: 12, color: 'var(--text-muted)' }}>
        <Link href={'/' as Route} style={{ color: 'inherit', textDecoration: 'none' }}>
          ← Plio.
        </Link>
      </nav>

      <header style={{ marginBottom: 32 }}>
        <div className="page-eyebrow">État du système</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px, 5vw, 48px)', letterSpacing: '-0.025em', fontWeight: 400, lineHeight: 1.05, margin: '8px 0 16px' }}>
          {health
            ? STATUS_LABELS[health.status]
            : 'Impossible de vérifier'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
          Dernière vérification : {health?.timestamp ? new Date(health.timestamp).toLocaleString('fr-CA') : '—'}
          {health?.releaseId && ` · release ${health.releaseId}`}
          {health?.totalLatencyMs !== undefined && ` · ${health.totalLatencyMs}ms`}
        </p>
      </header>

      {/* Status badge géant */}
      <div
        style={{
          padding: 28,
          background: health ? STATUS_COLORS[health.status] : 'var(--bg-sunken)',
          // Round 43 #3 — couleur conditionnée au fond. Avant : #fff figé →
          // (1) invisible quand health=null (fond bg-sunken clair), (2) faible
          // contraste en dark (success/warning/danger s'éclaircissent).
          color: health ? 'var(--text-on-accent)' : 'var(--text-primary)',
          borderRadius: 'var(--r-xl)',
          marginBottom: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <div style={{ fontSize: 40 }}>
          {!health ? '⚠️' : health.status === 'pass' ? '✓' : health.status === 'warn' ? '⚠' : '✗'}
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            {health ? STATUS_LABELS[health.status] : 'Vérification impossible'}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
            {health?.status === 'pass' && 'Aucun incident détecté en ce moment.'}
            {health?.status === 'warn' && 'Une dépendance non-critique est dégradée. Le service reste utilisable.'}
            {health?.status === 'fail' && 'Une dépendance critique est down. On travaille à résoudre, écris à bonjour@plio.ca pour update.'}
            {!health && 'L\'endpoint /api/health est lui-même inaccessible. Ça suggère un problème majeur côté serveur.'}
          </div>
        </div>
      </div>

      {/* Liste des checks */}
      {health && (
        <section>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>
            Composants surveillés
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {Object.entries(health.checks).map(([key, check]) => {
              const label = CHECK_LABELS[key] ?? { name: key, desc: '' };
              return (
                <div
                  key={key}
                  style={{
                    padding: '16px 20px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-md)',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 16,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {label.name}
                    </div>
                    {label.desc && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                        {label.desc}
                      </div>
                    )}
                    {check.error && (
                      <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                        Erreur : {check.error}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        borderRadius: 4,
                        background: check.status === 'pass' ? 'var(--success-soft, #f0fdf4)' : 'var(--danger-soft)',
                        color: check.status === 'pass' ? 'var(--success, #16a34a)' : 'var(--danger)',
                      }}
                    >
                      {check.status === 'pass' ? '✓ OK' : '✗ Fail'}
                    </span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                      {check.latencyMs}ms
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Liens utiles */}
      <section
        style={{
          marginTop: 40,
          padding: 22,
          background: 'var(--bg-sunken)',
          borderRadius: 'var(--r-md)',
        }}
      >
        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '0 0 12px' }}>
          Liens utiles
        </h3>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6, fontSize: 13 }}>
          <li>
            <a href="/api/health" style={{ color: 'var(--accent-primary)' }}>JSON brut du health check</a>
            {' '}— pour les monitors externes
          </li>
          <li>
            <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a>
            {' '}— pour signaler un incident
          </li>
          <li>
            <Link href={'/help' as Route} style={{ color: 'var(--accent-primary)' }}>Centre d&apos;aide</Link>
            {' '}— FAQ et réponses
          </li>
        </ul>
      </section>

      {/* Hidden monitor endpoint discovery */}
      <link rel="alternate" type="application/json" href={`${baseUrl}/api/health`} title="Plio health check" />
    </main>
  );
}
