/**
 * TEMPORARY DEBUG ENDPOINT — à retirer après diagnostic.
 *
 * Compare 2 modes de lecture des env vars :
 *   - INLINED : process.env.X (référence statique) → Next.js replace au build
 *   - DYNAMIC : process.env[key] (clé dynamique) → lit le runtime env Lambda
 *
 * Si INLINED a la valeur mais DYNAMIC est undefined → build-time inlining
 * fonctionne, le code via static refs (auth.ts, s3.ts, etc.) marche.
 * Si DYNAMIC a la valeur → Amplify propagate vraiment au runtime.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  // Static refs (inlined by Next.js at build time)
  const inlined = {
    DATABASE_URL: maskUrl(process.env.DATABASE_URL),
    AUTH_SECRET: maskSecret(process.env.AUTH_SECRET),
    AUTH_URL: process.env.AUTH_URL,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    SINALITE_CLIENT_ID: maskSecret(process.env.SINALITE_CLIENT_ID),
    SINALITE_CLIENT_SECRET: maskSecret(process.env.SINALITE_CLIENT_SECRET),
    STRIPE_SECRET_KEY: maskSecret(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: maskSecret(process.env.STRIPE_WEBHOOK_SECRET),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: maskSecret(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SES_SMTP_USER: maskSecret(process.env.SES_SMTP_USER),
    SES_SMTP_PASS: maskSecret(process.env.SES_SMTP_PASS),
    SES_FROM: process.env.SES_FROM,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: maskSecret(process.env.S3_ACCESS_KEY_ID),
    S3_SECRET_ACCESS_KEY: maskSecret(process.env.S3_SECRET_ACCESS_KEY),
  };

  // Dynamic refs (Lambda runtime env, not inlined)
  const dynamicKeys = ['DATABASE_URL', 'S3_BUCKET', 'STRIPE_SECRET_KEY', 'AUTH_SECRET'];
  const dynamic: Record<string, string | undefined> = {};
  for (const k of dynamicKeys) {
    const v = process.env[k];
    dynamic[k] = v ? maskSecret(v) : '<undefined>';
  }

  return NextResponse.json({
    runtime: 'lambda',
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    inlined,    // ← these are what auth.ts, s3.ts, etc. actually use
    dynamic,    // ← these are what Lambda runtime env has
  });
}

function maskSecret(s: string | undefined): string {
  if (!s) return '<undefined>';
  return `${s.slice(0, 4)}…${s.slice(-2)} (len=${s.length})`;
}

function maskUrl(s: string | undefined): string {
  if (!s) return '<undefined>';
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.hostname}/${u.pathname.slice(0, 8)}… (len=${s.length})`;
  } catch {
    return `<invalid url len=${s.length}>`;
  }
}
