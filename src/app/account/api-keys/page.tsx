import type { Route } from 'next';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { API_KEY_SCOPES } from '@/lib/mcp/auth';
import Sidebar from '@/components/account/Sidebar';
import ApiKeysClient from './ApiKeysClient';

export const metadata: Metadata = { title: 'Clés API — Plio' };

/** Libellés FR des scopes (server → client ; évite d'importer le module auth côté client). */
const SCOPE_LABELS: Record<string, string> = {
  'orders:write': 'Passer des commandes (create_order)',
  'catalog:read': 'Lecture du catalogue (déjà public)',
};

export default async function ApiKeysPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in?callbackUrl=/account/api-keys' as Route);

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, keyPrefix: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });

  const initialKeys = keys.map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
  }));

  const availableScopes = API_KEY_SCOPES.map((value) => ({ value, label: SCOPE_LABELS[value] ?? value }));

  return (
    <div className="acct-shell">
      <Sidebar active="/account/api-keys" />
      <main className="acct-main">
        <header className="acct-header">
          <div>
            <h1 className="acct-page-title">Clés API</h1>
            <p className="acct-page-subtitle">
              Accès programmatique à Plio via le serveur MCP (assistants IA). Endpoint :
              {' '}<code style={{ fontFamily: 'var(--font-mono)' }}>POST /api/mcp/mcp</code> · en-tête{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>Authorization: Bearer …</code>
            </p>
          </div>
        </header>
        <ApiKeysClient initialKeys={initialKeys} availableScopes={availableScopes} />
      </main>
    </div>
  );
}
