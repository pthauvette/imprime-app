/**
 * GET /api/cron/wallet-expiry
 *
 * Round 19 #3 — cron mensuel qui expire les wallets inactifs depuis
 * 12 mois (rolling : tout topup ou spend reset le clock).
 *
 * Phase 1 — Warning email à mois 11 :
 *   Pour chaque user avec walletCents > 0 + walletLastActivityAt entre
 *   11 mois ago et 11 mois + 30j ago + walletExpiryWarningAt < lastActivityAt :
 *   - Envoie email "Tes X $ expirent dans 1 mois"
 *   - Set walletExpiryWarningAt = now (dédup)
 *
 * Phase 2 — Expiration à mois 12 :
 *   Pour chaque user avec walletCents > 0 + walletLastActivityAt > 12 mois :
 *   - recordWalletTx kind=EXPIRY amountCents=-walletCents
 *     (debit complet → balance = 0)
 *   - Email confirmation (passé en silence sinon mauvaise UX)
 *
 * Schedule : 0 6 1 * * (1er du mois, 6h UTC). Pas critique de timing.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { recordWalletTx } from '@/lib/wallet/operations';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

const TWELVE_MONTHS_MS = 365 * 24 * 3600 * 1000;
const ELEVEN_MONTHS_MS = 335 * 24 * 3600 * 1000;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'wallet-expiry');
  if (denied) return denied;

  const start = Date.now();
  const now = new Date();
  const eleven = new Date(now.getTime() - ELEVEN_MONTHS_MS);
  const twelve = new Date(now.getTime() - TWELVE_MONTHS_MS);

  let warningsSent = 0;
  let expired = 0;
  let totalExpiredCents = 0;

  try {
    // Phase 1 — Warning email à mois 11
    // Candidats : walletCents > 0 + lastActivityAt entre 12m et 11m ago +
    // warning pas déjà envoyé pour ce cycle (warningAt < lastActivityAt
    // OU warningAt null).
    const warningCandidates = await prisma.user.findMany({
      where: {
        walletCents: { gt: 0 },
        walletLastActivityAt: {
          gte: twelve,
          lt: eleven,
        },
      },
      select: {
        id: true, email: true, walletCents: true,
        walletLastActivityAt: true, walletExpiryWarningAt: true,
      },
      take: 1000,
    });

    for (const u of warningCandidates) {
      // Dédup : skip si on a déjà warned plus récemment que la lastActivity
      if (u.walletExpiryWarningAt && u.walletLastActivityAt
          && u.walletExpiryWarningAt > u.walletLastActivityAt) {
        continue;
      }
      try {
        await sendAdminCustomMessageEmail({
          to: u.email,
          replyTo: 'bonjour@plio.ca',
          vars: {
            ORDER_ID: u.id.slice(-6).toUpperCase(),
            SUBJECT: `⏰ Ton crédit wallet expire dans 1 mois`,
            PREVIEW: `${(u.walletCents / 100).toFixed(2)} $ de crédit vont expirer`,
            BODY_HTML: `
              <p>Salut,</p>
              <p>Ton wallet Plio contient <strong>${(u.walletCents / 100).toFixed(2)} $</strong> de crédit
              prépayé qui n'a pas été utilisé depuis 11 mois.</p>
              <p>Sans activité (commande OU nouveau top-up) avant 1 mois, le crédit expirera
              automatiquement (politique anti-inactif documentée dans les CGU).</p>
              <p><strong>Pour conserver ton crédit :</strong> passe une commande, même petite — le clock se reset.</p>
              <p style="margin-top:20px;">
                <a href="${APP_URL}/order/start" style="display:inline-block; padding:12px 20px; background:#1F3D2B; color:#fff; border-radius:24px; text-decoration:none; font-weight:600;">
                  Démarrer une commande →
                </a>
              </p>
              <p style="margin-top:24px; font-size:13px; color:#7A8780;">— L'équipe Plio</p>
            `,
            ORDER_URL: `${APP_URL}/wallet`,
            SENDER_NAME: 'Plio',
            SENDER_EMAIL: 'bonjour@plio.ca',
          },
        });
        await prisma.user.update({
          where: { id: u.id },
          data: { walletExpiryWarningAt: now },
        });
        warningsSent++;
      } catch (err) {
        log.error({ err, userId: u.id }, 'wallet expiry warning send failed');
      }
    }

    // Phase 2 — Expiration à mois 12
    const expireCandidates = await prisma.user.findMany({
      where: {
        walletCents: { gt: 0 },
        walletLastActivityAt: { lt: twelve },
      },
      select: { id: true, email: true, walletCents: true },
      take: 500,
    });

    for (const u of expireCandidates) {
      try {
        await recordWalletTx({
          userId: u.id,
          kind: 'EXPIRY',
          amountCents: -u.walletCents,
          description: `Wallet inactif depuis 12 mois — expiré (${(u.walletCents / 100).toFixed(2)} $)`,
        });
        totalExpiredCents += u.walletCents;
        expired++;
      } catch (err) {
        log.error({ err, userId: u.id }, 'wallet expiry tx failed');
      }
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      warningsSent,
      expired,
      totalExpiredCents,
    };
    log.info(result, 'cron/wallet-expiry ran');
    void pingCronHealthcheck('wallet-expiry', 'success', { warningsSent, expired });
    void recordCronRun({
      name: 'wallet-expiry',
      status: 'success',
      latencyMs: Date.now() - start,
      data: { warningsSent, expired, totalExpiredCents },
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/wallet-expiry failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('wallet-expiry', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'wallet-expiry',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
    });
    return NextResponse.json(
      { ok: false, error: errMsg, latencyMs: Date.now() - start },
      { status: 500 },
    );
  }
}
