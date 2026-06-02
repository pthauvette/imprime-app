/**
 * Helpers pour AdminAuditEvent — append-only log de toutes les actions
 * admin sensibles. À call depuis :
 *   - /api/admin/* routes (refund manuel, cancel manuel, resend email)
 *   - /orders + /orders/[id] quand un admin utilise ?viewAsUserId=...
 *   - /admin/templates/[slug]/edit (édition de template publique)
 *
 * Important : `recordAdminAudit` ne throw JAMAIS — c'est du logging
 * defensive. Si on perd un audit, on ne veut pas bloquer l'action admin.
 * Une erreur de DB ici → Sentry + console.error + on continue.
 */

import { prisma } from '@/lib/db';
import { logAdmin } from '@/lib/logger';

export type AdminAuditKind =
  | 'ADMIN_VIEW_AS_USER'
  | 'ADMIN_MANUAL_REFUND'
  | 'ADMIN_MANUAL_CANCEL'
  | 'ADMIN_RESEND_EMAIL'
  | 'ADMIN_TEMPLATE_EDIT'
  | 'ADMIN_REPLAY_SINALITE'
  | 'ADMIN_PROMO_CREATE'
  | 'ADMIN_PROMO_TOGGLE'
  | 'ADMIN_PROMO_UPDATE'
  | 'ADMIN_PRODUCT_OVERRIDE_UPSERT'
  | 'ADMIN_PRODUCT_OVERRIDE_DELETE'
  | 'ADMIN_DATA_EXPORT'
  | 'ADMIN_USER_NOTES_UPDATE'
  | 'ADMIN_EXPERIMENT_TOGGLE'
  | 'ADMIN_BULK_STATUS_UPDATE'
  | 'ADMIN_DELETE_USER_PIPEDA'
  | 'ADMIN_TAX_EXEMPT_TOGGLE'
  | 'ADMIN_RESELLER_STATUS_CHANGE'
  // Round 1 audit — kinds dédiés pour des actions sensibles qui logaient
  // toutes 'ADMIN_TEMPLATE_EDIT' (indistinguables dans /admin/audit).
  | 'ADMIN_USER_ROLE_CHANGE' // élévation/rétrogradation de privilège (USER↔ADMIN)
  | 'ADMIN_USER_BULK_ACTION' // autres actions bulk users (opt-in/out emails, message)
  | 'ADMIN_WEBHOOK_REPLAY' // rejeu d'un webhook (financier)
  | 'ADMIN_REVIEW_MODERATE' // modération d'un avis (approve/reject/reply)
  | 'ADMIN_RESELLER_DECISION'; // décision sur une demande reseller (approve/reject/archive)

export type AdminAuditTargetType = 'USER' | 'ORDER' | 'TEMPLATE' | 'PROMO_CODE' | 'PRODUCT' | 'EXPERIMENT';

export interface AdminAuditInput {
  kind: AdminAuditKind;
  adminId: string;
  adminEmail: string;
  targetType?: AdminAuditTargetType;
  targetId?: string;
  /** Contexte structuré (URL, montant, raison, etc.). Sera JSON-stringified. */
  data?: Record<string, unknown>;
}

/**
 * Append un event d'audit admin. Best-effort : ne throw jamais, log un
 * warning si l'insert échoue mais retourne quand même.
 */
export async function recordAdminAudit(input: AdminAuditInput): Promise<void> {
  try {
    await prisma.adminAuditEvent.create({
      data: {
        kind: input.kind,
        adminId: input.adminId,
        adminEmail: input.adminEmail.toLowerCase(),
        targetType: input.targetType,
        targetId: input.targetId,
        data: input.data ? JSON.stringify(input.data) : null,
      },
    });
  } catch (err) {
    // Audit log failure n'est pas une raison de fail l'action admin.
    // On capture dans Sentry via logAdmin + on warn pour analyse manuelle.
    logAdmin.warn(
      { err, kind: input.kind, adminId: input.adminId, targetId: input.targetId },
      'admin audit insert failed',
    );
  }
}
