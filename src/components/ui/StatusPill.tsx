import type { CSSProperties } from 'react';
import { TONE_TOKENS, type Tone } from '@/lib/ui/status-tone';

/**
 * StatusPill — rendu unifié d'un statut, token-mappé (Round 43 #2).
 *
 * Remplace les records statut→couleur dupliqués par page. Le ton (neutral/
 * accent/info/warning/success/danger) vient d'une map de domaine (ex.
 * ORDER_STATUS_TONE) ; ce composant ne connaît que les tons → couleurs DS.
 * Tous les tokens basculent light/dark → dark-safe par construction.
 *
 * Deux rendus (le statut commande était historiquement affiché des 2 façons,
 * on garde les deux pour ne casser aucun visuel) :
 *   - variant="pill" (défaut) : pastille fond doux + texte ton (admin, détail)
 *   - variant="text"          : texte coloré seul, pas de fond (listes denses
 *                               comme le dashboard /account)
 *
 * `dot` ajoute une puce de couleur (utile en variant text pour garder un
 * repère visuel sans le poids d'une pastille).
 */

type Props = {
  tone: Tone;
  label: string;
  variant?: 'pill' | 'text';
  dot?: boolean;
  /** Override ponctuel (ex. taille de police dans un contexte mono). */
  style?: CSSProperties;
  className?: string;
};

export default function StatusPill({
  tone,
  label,
  variant = 'pill',
  dot = false,
  style,
  className,
}: Props) {
  const { bg, fg } = TONE_TOKENS[tone];

  if (variant === 'text') {
    return (
      <span
        className={className}
        style={{
          color: fg,
          fontWeight: 600,
          display: dot ? 'inline-flex' : undefined,
          alignItems: dot ? 'center' : undefined,
          gap: dot ? 6 : undefined,
          ...style,
        }}
      >
        {dot && (
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 'var(--r-pill)',
              background: fg,
              flexShrink: 0,
            }}
          />
        )}
        {label}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: 'var(--r-pill)',
        background: bg,
        color: fg,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 'var(--r-pill)',
            background: fg,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
}
