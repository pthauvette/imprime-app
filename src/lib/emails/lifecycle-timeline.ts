/**
 * Génère le HTML inline-styled d'une mini-timeline 4 étapes pour les
 * emails lifecycle (confirmation, shipped, delivered, etc.).
 *
 * Style aligné avec celui hardcodé dans email-order-shipped.html — on
 * extrait ici pour pouvoir l'injecter via {{LIFECYCLE_TIMELINE_HTML}}
 * dans les autres templates lifecycle.
 *
 * Étapes :
 *   1. Reçue (PAID)
 *   2. Imprimée (IN_PRODUCTION)
 *   3. Expédiée (SHIPPED)
 *   4. Livrée (DELIVERED)
 *
 * Le `currentStep` détermine quelles étapes sont marquées done (✓ vert)
 * vs current (1F3D2B foncé) vs pending (border gris). 0 = aucune done.
 *
 * Compat email : table-based layout, inline styles uniquement, pas de
 * CSS class (Gmail/Outlook).
 */

export interface LifecycleStep {
  /** Label affiché sous le rond. */
  label: string;
  /** Order de présentation (1-4). */
  position: 1 | 2 | 3 | 4;
}

export const DEFAULT_LIFECYCLE_STEPS: LifecycleStep[] = [
  { position: 1, label: 'Reçue' },
  { position: 2, label: 'Imprimée' },
  { position: 3, label: 'Expédiée' },
  { position: 4, label: 'Livrée' },
];

/**
 * @param currentStep — 0..4. Les steps avec position <= currentStep sont
 *   marquées "done" (✓ sur fond vert foncé). Si == currentStep, c'est
 *   l'étape courante. Le reste est pending (cercle vide bordure grise).
 */
export function renderLifecycleTimeline(
  currentStep: 0 | 1 | 2 | 3 | 4,
  steps: LifecycleStep[] = DEFAULT_LIFECYCLE_STEPS,
): string {
  const cells = steps.map((step) => renderCell(step, currentStep)).join('\n');

  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
  <tr>
    <td style="padding:0 0 16px 0;">
      <p style="margin:0; font-family:ui-monospace,'SF Mono',Menlo,monospace; font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:#7A8780; font-weight:600; text-align:center;">
        Progression
      </p>
    </td>
  </tr>
  <tr>
    <td>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
${cells}
        </tr>
      </table>
    </td>
  </tr>
</table>
`.trim();
}

function renderCell(step: LifecycleStep, currentStep: number): string {
  const isDone = step.position < currentStep;
  const isCurrent = step.position === currentStep;
  const isPending = step.position > currentStep;

  const dotStyle = isDone
    ? 'background:#1F3D2B; color:#FAFAF7; border-radius:9999px; font-size:14px; line-height:28px; font-family:Georgia,serif;'
    : isCurrent
      ? 'background:#1F3D2B; color:#FAFAF7; border-radius:9999px; font-size:11px; line-height:28px; font-family:ui-monospace,monospace; font-weight:600;'
      : 'background:#FFFFFF; color:#7A8780; border:2px solid #ECEAE3; border-radius:9999px; font-size:11px; line-height:24px; font-family:ui-monospace,monospace; font-weight:600;';

  const dotContent = isDone ? '&check;' : String(step.position);

  const labelColor = isPending ? '#7A8780' : '#141C16';
  const labelWeight = isPending ? '400' : '600';

  return `          <td align="center" width="25%" valign="top">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td width="28" height="28" align="center" style="${dotStyle}">${dotContent}</td></tr></table>
            <p style="margin:8px 0 0 0; font-size:12px; font-weight:${labelWeight}; color:${labelColor};">${step.label}</p>
          </td>`;
}

/**
 * Map du status Order → currentStep entier. Utile pour passer
 * directement order.status au renderer sans switch.
 */
export function statusToStep(status: string): 0 | 1 | 2 | 3 | 4 {
  switch (status) {
    case 'PAID':
    case 'SUBMITTED':
      return 1; // Reçue
    case 'IN_PRODUCTION':
      return 2; // Imprimée
    case 'SHIPPED':
      return 3; // Expédiée
    case 'DELIVERED':
      return 4; // Livrée
    default:
      return 0;
  }
}
