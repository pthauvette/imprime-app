'use client';

/**
 * UserMenu — dropdown user dans le header marketing/site.
 *
 * Affiché quand l'user est connecté. Sert de hub central pour :
 *  - accéder au /account (dashboard)
 *  - voir Mes commandes
 *  - gérer ses adresses
 *  - toggle thème (light/dark)
 *  - switch langue (FR/EN)
 *  - se déconnecter
 *
 * Pattern : avatar circulaire avec initiales → click → popover panel.
 * Click outside ferme. Esc ferme. Pas de focus trap pour MVP.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { signOut } from 'next-auth/react';
import ThemeToggle from './ThemeToggle';
import LangSwitch from '@/components/i18n/LangSwitch';

interface UserMenuProps {
  user: {
    name?: string | null;
    email: string;
    image?: string | null;
  };
}

function initials(name: string | null | undefined, email: string): string {
  const src = (name ?? email.split('@')[0] ?? '').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export default function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  // Round 46 — position (viewport-relative) figée à l'ouverture. Le popover est
  // rendu en PORTAIL vers <body> avec position: fixed, pour échapper au stacking
  // context du header (.mkt-nav/.shell sont en z-index:2 comme <main>, donc le
  // menu, prisonnier de cette couche, était peint DERRIÈRE <main> → items non
  // cliquables, dont « Se déconnecter »). Le portail le sort de ce piège.
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Round 7 #1 — piège le focus dans le popover (rendu en portail) et le
  // restaure sur l'avatar à la fermeture.
  useFocusTrap(panelRef, open);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        panelRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // position: fixed (portail) → on ferme au scroll/resize plutôt que de
    // laisser le menu détaché de l'avatar.
    function onScrollResize() { setOpen(false); }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open]);

  const display = user.name ?? user.email;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu utilisateur — ${display}`}
        title={display}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--accent-soft)',
          color: 'var(--accent-primary)',
          border: '1px solid var(--border-subtle)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          letterSpacing: 0,
        }}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          initials(user.name, user.email)
        )}
      </button>

      {open && coords && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{
            position: 'fixed',
            top: coords.top,
            right: coords.right,
            zIndex: 1000,
            minWidth: 260,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg, 12px)',
            boxShadow: '0 10px 36px rgba(0,0,0,0.14)',
            padding: 8,
            color: 'var(--text-primary)',
          }}
        >
          {/* Header user */}
          <div style={{ padding: '12px 12px 14px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              {display}
            </div>
            {user.name && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {user.email}
              </div>
            )}
          </div>

          <MenuLink href="/account" label="Mon compte" icon="◉" onClick={() => setOpen(false)} />
          <MenuLink href="/orders" label="Mes commandes" icon="📦" onClick={() => setOpen(false)} />
          <MenuLink href="/addresses" label="Mes adresses" icon="📍" onClick={() => setOpen(false)} />
          <MenuLink href="/account/favorites" label="Mes favoris" icon="★" onClick={() => setOpen(false)} />
          <MenuLink href="/settings" label="Réglages" icon="⚙" onClick={() => setOpen(false)} />

          {/* Préférences inline */}
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              marginTop: 6,
              padding: '10px 12px 4px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              fontWeight: 600,
            }}
          >
            Préférences
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px' }}>
            <span style={{ fontSize: 13 }}>Thème</span>
            <ThemeToggle />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px 10px' }}>
            <span style={{ fontSize: 13 }}>Langue</span>
            <LangSwitch />
          </div>

          {/* Sign out */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 6, paddingTop: 6 }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void signOut({ callbackUrl: '/' });
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                fontSize: 13,
                color: 'var(--danger, #dc2626)',
                cursor: 'pointer',
                borderRadius: 'var(--r-sm, 6px)',
                fontWeight: 500,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--danger-soft, #fef2f2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              ↩ Se déconnecter
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function MenuLink({
  href,
  label,
  icon,
  onClick,
}: {
  href: string;
  label: string;
  icon: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        textDecoration: 'none',
        color: 'var(--text-primary)',
        fontSize: 13,
        borderRadius: 'var(--r-sm, 6px)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-sunken)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span aria-hidden style={{ width: 16, textAlign: 'center', color: 'var(--text-muted)' }}>{icon}</span>
      <span>{label}</span>
    </a>
  );
}
