/**
 * Tons sémantiques partagés pour les badges/pastilles de statut — Round 43 #2.
 *
 * Pourquoi : avant ce module, chaque page mappait un statut → couleur dans son
 * propre record inline (STATUS_BADGES, PRIORITY_COLOR, STATUS_META, STATUS_CLASS
 * local...). Résultat : divergence (un OrderStatus rendu en 4 schémas de
 * couleurs contradictoires entre /account, /orders, /admin/orders) ET hex nus
 * qui ne basculaient pas en dark mode.
 *
 * Maintenant : un seul vocabulaire de TONS (neutral/accent/info/warning/
 * success/danger), chacun mappé sur les tokens DS (-soft pour le fond, plein
 * pour le texte). Les tokens basculent automatiquement light/dark. Chaque
 * domaine (commande, email, promo...) définit SA map statut→ton ; le rendu
 * passe par <StatusPill> qui ne connaît que les tons.
 */

export type Tone = 'neutral' | 'accent' | 'info' | 'warning' | 'success' | 'danger';

/**
 * Ton → paire de tokens (fond doux + texte). Tous les tokens existent en
 * light ET dark (cf. globals.css :root + [data-theme="dark"]) donc un
 * <StatusPill> est dark-safe sans effort.
 */
export const TONE_TOKENS: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--bg-sunken)', fg: 'var(--text-secondary)' },
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-primary)' },
  info: { bg: 'var(--info-soft)', fg: 'var(--info)' },
  warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
};
