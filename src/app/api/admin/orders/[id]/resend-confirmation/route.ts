/**
 * POST /api/admin/orders/[id]/resend-confirmation
 *
 * Re-shoot l'email order-confirmation. Pratique quand un user dit avoir
 * pas reçu le mail, ou pour test SES après changement de config.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { enAttenteDeTranchage } from '@/lib/orders/uncertain-marker';
import { sendOrderConfirmationEmail } from '@/lib/emails/send';

export const POST = withErrorHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  // ⚠️ « C'EST IMPRIMÉ! » — c'est l'objet ET le titre de ce gabarit, et il
  // joint la facture. Sur une commande dont la soumission est partie sans
  // réponse, c'est une affirmation qu'on ne peut pas tenir.
  //
  // Ce bouton est le PREMIER du panneau et se rend sans condition, donc
  // AU-DESSUS de l'encadré rouge qui explique de ne rien faire. Et le filtre
  // `?flag=incertaine` que ce lot ajoute pour rassembler ces commandes rend le
  // geste groupé naturel : sélectionner tout, « Renvoyer la confirmation », et
  // N clients apprennent que leur commande est imprimée.
  if (enAttenteDeTranchage(order)) {
    return NextResponse.json(
      {
        error:
          "Soumission partie sans réponse : ce courriel annonce « c'est imprimé » et joint la " +
          'facture. On ne peut pas le tenir tant que la production n’est pas confirmée. ' +
          'Tranche d’abord depuis la fiche.',
      },
      { status: 409 },
    );
  }

  const result = await sendOrderConfirmationEmail({ order, user: order.user });

  await recordAdminAudit({
    kind: 'ADMIN_RESEND_EMAIL',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    targetId: order.id,
    data: {
      template: 'order-confirmation',
      to: order.user.email,
      sent: result.sent,
      deliveryId: result.id,
    },
  });

  // Le queue helper retourne { sent, id }. Si sent=false, l'email est queued
  // pour retry automatique — pas un échec final, juste pas envoyé du premier
  // coup. Le cron /api/cron/email-retry retentera.
  return NextResponse.json({
    ok: true,
    to: order.user.email,
    sent: result.sent,
    deliveryId: result.id,
  });
});
