/**
 * POST /api/admin/orders/quick-link
 *
 * Outil admin pour préparer une commande téléphonique : admin entre
 * email client + productId + options + note, le serveur construit le
 * deep-link vers /order/configure et envoie un email au client avec
 * un message custom + le lien.
 *
 * Le client clique → arrive dans le wizard avec produit + options
 * pré-sélectionnés (cf. /order/configure pour le handling du param
 * `options=...`). Il complète upload + shipping + paiement comme
 * normal — l'admin n'a pas à gérer le paiement ni les fichiers.
 *
 * Audit log : ADMIN_RESEND_EMAIL avec action=QUICK_LINK_SENT (reuse
 * le kind existant pour éviter de polluer l'enum).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { sinalite } from '@/lib/sinalite/client';

const BodySchema = z.object({
  customerEmail: z.string().email(),
  productId: z.number().int().positive(),
  optionIds: z.array(z.number().int().positive()).min(1),
  /** Note libre incluse dans l'email pour expliquer le contexte au client. */
  note: z.string().max(2000).optional(),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);

  // Verify le product existe — utile pour catch les typos avant d'envoyer
  // l'email au client.
  let productName = `Produit #${body.productId}`;
  try {
    const prod = await sinalite.getProduct(body.productId);
    productName = prod.name ?? productName;
  } catch {
    return NextResponse.json(
      { error: `Produit #${body.productId} introuvable côté Sinalite. Vérifie l'ID.` },
      { status: 400 },
    );
  }

  // Construit le deep-link
  const deepLink = `${APP_URL}/order/configure?productId=${body.productId}&options=${body.optionIds.join(',')}`;

  // Compose le body de l'email — markdown-like simple, on laisse l'admin
  // optionnellement ajouter du contexte via `note`.
  const adminName = guard.user.name ?? guard.user.email.split('@')[0];
  const noteBlock = body.note ? `${body.note}\n\n` : '';
  const messageBody =
    `Bonjour,\n\n` +
    `J'ai préparé ta commande pour ${productName} avec les options qu'on a discutées.\n\n` +
    noteBlock +
    `Clique sur ce lien pour vérifier, uploader tes fichiers, et compléter le paiement :\n\n` +
    `${deepLink}\n\n` +
    `Si tu as une question, réponds simplement à cet email.\n\n` +
    `Merci !\n${adminName}`;

  // Envoie via le template custom-message (reuse total du template existant).
  // L'ORDER_ID est mis à "—" parce qu'on n'a pas encore d'Order — la link
  // dans le template pointera vers /orders/— qui sera ignoré par le client
  // (il va cliquer sur le lien deep-link dans le body, pas le CTA).
  const result = await sendAdminCustomMessageEmail({
    to: body.customerEmail,
    replyTo: guard.user.email,
    vars: {
      ORDER_ID: '—',
      SUBJECT: `Ta commande Plio est prête à finaliser — ${productName}`,
      PREVIEW: `${adminName} a préparé ${productName} pour toi · clique pour finaliser`,
      BODY_HTML: messageBody
        .split(/\n\n+/)
        .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
        .join('\n'),
      ORDER_URL: deepLink,
      SENDER_NAME: adminName,
      SENDER_EMAIL: guard.user.email,
    },
  });

  void recordAdminAudit({
    kind: 'ADMIN_RESEND_EMAIL',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: body.customerEmail.toLowerCase(),
    data: {
      action: 'QUICK_LINK_SENT',
      productId: body.productId,
      productName,
      optionIds: body.optionIds,
      deepLink,
      noteLength: body.note?.length ?? 0,
    },
  });

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    to: body.customerEmail,
    deepLink,
  });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
