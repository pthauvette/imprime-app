/**
 * TEMPORARY DEBUG ENDPOINT — à retirer après diagnostic Amplify env vars.
 *
 * Retourne quelles env vars sont visibles au runtime SANS exposer les
 * valeurs (juste présent + longueur). Permet de pinpointer si Amplify
 * a bien propagé les vars du Console vers le Lambda.
 *
 * Aucune valeur n'est exposée — uniquement la présence et la longueur.
 * Mais quand même : à supprimer dès qu'on a la réponse.
 */

import { NextResponse } from 'next/server';

const KEYS_TO_CHECK = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_URL',
  'AUTH_TRUST_HOST',
  'ADMIN_EMAILS',
  'SINALITE_CLIENT_ID',
  'SINALITE_CLIENT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'SES_SMTP_USER',
  'SES_SMTP_PASS',
  'SES_FROM',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

export async function GET() {
  const result: Record<string, { present: boolean; length: number; preview: string }> = {};
  for (const key of KEYS_TO_CHECK) {
    const val = process.env[key];
    result[key] = {
      present: val !== undefined && val !== '',
      length: val?.length ?? 0,
      // Preview ONLY for non-secret keys (region, bucket name, public URL)
      preview: ['S3_REGION', 'S3_BUCKET', 'NEXT_PUBLIC_APP_URL', 'AUTH_URL', 'SES_FROM', 'ADMIN_EMAILS'].includes(key)
        ? (val ?? '<undefined>')
        : (val ? `${val.slice(0, 4)}…${val.slice(-2)}` : '<undefined>'),
    };
  }
  return NextResponse.json({
    runtime: 'lambda',
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    vars: result,
  });
}
