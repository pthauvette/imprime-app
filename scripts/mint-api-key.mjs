#!/usr/bin/env node
/**
 * Mint une clé API Plio pour le MCP. Affiche le token en clair UNE fois.
 *
 * Usage :
 *   node scripts/mint-api-key.mjs --email user@example.com --name "Agent Claude" --scopes orders:write
 *
 * NOTE : duplique volontairement les 3 lignes de génération de src/lib/mcp/auth.ts
 * (pas de `tsx` dans le repo → un .mjs ne peut pas importer le .ts). Garder en
 * phase avec auth.ts (KEY_PREFIX_LIVE, hash sha256, whitelist scopes).
 */
import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const KEY_PREFIX_LIVE = 'plio_sk_live_';
const API_KEY_SCOPES = ['orders:write', 'catalog:read'];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function parseScopes(csv) {
  if (!csv) return [];
  const set = new Set();
  for (const raw of csv.split(',')) {
    const s = raw.trim().toLowerCase();
    if (API_KEY_SCOPES.includes(s)) set.add(s);
    else if (s) throw new Error(`Scope inconnu : "${s}". Connus : ${API_KEY_SCOPES.join(', ')}`);
  }
  return [...set];
}

async function main() {
  const email = arg('email');
  const name = arg('name') ?? 'CLI key';
  const scopes = parseScopes(arg('scopes'));
  if (!email) {
    console.error('Usage: node scripts/mint-api-key.mjs --email <email> [--name <label>] [--scopes orders:write,catalog:read]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
    if (!user) {
      console.error(`Aucun user avec l'email ${email}.`);
      process.exit(1);
    }

    // === génération (en phase avec src/lib/mcp/auth.ts generateApiKey) ===
    const secret = randomBytes(32).toString('base64url'); // 256 bits
    const token = `${KEY_PREFIX_LIVE}${secret}`;
    const keyHash = createHash('sha256').update(token).digest('hex');
    const keyPrefix = token.slice(0, KEY_PREFIX_LIVE.length + 6);

    const key = await prisma.apiKey.create({
      data: { userId: user.id, name, keyHash, keyPrefix, scopes: scopes.join(',') },
      select: { id: true },
    });

    console.log('\n✅ Clé API créée.');
    console.log(`   id      : ${key.id}`);
    console.log(`   user    : ${email}`);
    console.log(`   scopes  : ${scopes.join(', ') || '(aucun)'}`);
    console.log('\n⚠️  Copie ce token MAINTENANT — il ne sera PLUS JAMAIS affiché :\n');
    console.log(`   ${token}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
