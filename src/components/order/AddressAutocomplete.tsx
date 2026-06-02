'use client';

/**
 * Input avec suggestions Canada Post. Tape "1234 Saint-D" → debounce 200ms
 * → fetch /api/address/autocomplete → dropdown avec max 7 suggestions.
 * Click sur une suggestion → fetch /api/address/retrieve → onSelect fire
 * avec l'address structurée (line1, city, province, postalCode).
 *
 * Si Canada Post API pas configurée (available: false) → fonctionne comme
 * un input texte standard, pas de dropdown. Zero régression UX.
 *
 * Clavier : ↓↑ pour navigate, Enter pour select, Esc pour close.
 */

import { useEffect, useId, useRef, useState } from 'react';

interface FindItem {
  id: string;
  text: string;
  description?: string;
  type: string;
}

interface AddressDetail {
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  country: 'CA';
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Fire quand l'user select une suggestion complète. */
  onSelect: (address: AddressDetail) => void;
  placeholder?: string;
  /** Style de l'input — passé tel quel pour matcher les autres Field. */
  inputStyle?: React.CSSProperties;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  inputStyle,
}: Props) {
  const [items, setItems] = useState<FindItem[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  // Round 7 #5 — id stable (unique par instance) pour le pattern combobox.
  const listboxId = useId();
  const [loading, setLoading] = useState(false);
  const [lastId, setLastId] = useState<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Debounce 200ms — Canada Post charge par lookup, on évite le spam
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.trim().length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      void fetchSuggestions(value, lastId);
    }, 200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, lastId]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function fetchSuggestions(q: string, lastIdParam?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (lastIdParam) params.set('lastId', lastIdParam);
      const res = await fetch(`/api/address/autocomplete?${params.toString()}`);
      const data = (await res.json()) as { available: boolean; items: FindItem[] };
      setAvailable(data.available);
      setItems(data.items ?? []);
      setOpen((data.items ?? []).length > 0);
      setHighlight(-1);
    } catch {
      setAvailable(false);
      setItems([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(item: FindItem) {
    // Type Street / PostalCode = nested container → drill down via lastId
    if (item.type === 'Street' || item.type === 'Postcode' || item.type === 'PostalCode') {
      setLastId(item.id);
      // Garde l'input + force un re-fetch immédiat avec le nouveau lastId
      onChange(item.text);
      return;
    }
    // Type Address = vrai full address → retrieve + fire onSelect
    setOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/address/retrieve?id=${encodeURIComponent(item.id)}`);
      const data = (await res.json()) as { ok: boolean; address?: AddressDetail };
      if (data.ok && data.address) {
        onChange(data.address.line1);
        onSelect(data.address);
        setLastId(undefined);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Round 7 #5 — ré-ouverture clavier après Escape : ↓ rouvre la liste si on
    // a déjà des résultats (avant, impossible de rouvrir sans retaper).
    if (e.key === 'ArrowDown' && !open && items.length > 0) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && items[highlight]) {
        e.preventDefault();
        void handleSelect(items[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder ?? '1234 rue Saint-Denis, Montréal'}
        autoComplete="off"
        spellCheck={false}
        // Round 7 #5 — pattern combobox : la sélection ↑↓ devient audible.
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined
        }
        style={
          inputStyle ?? {
            width: '100%',
            border: 0,
            background: 'transparent',
            font: 'inherit',
            color: 'var(--text-primary)',
            outline: 'none',
          }
        }
      />
      {available === false && value.trim().length >= 3 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
          }}
        >
          (auto-complétion désactivée)
        </div>
      )}
      {open && items.length > 0 && (
        <div
          role="listbox"
          id={listboxId}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-md)',
            maxHeight: 280,
            overflow: 'auto',
            zIndex: 50,
          }}
        >
          {items.map((item, idx) => {
            const isHighlight = idx === highlight;
            return (
              <button
                key={item.id}
                id={`${listboxId}-opt-${idx}`}
                type="button"
                role="option"
                aria-selected={isHighlight}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => void handleSelect(item)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  background: isHighlight ? 'var(--accent-soft)' : 'transparent',
                  border: 0,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  borderBottom: idx < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <div style={{ fontWeight: 500 }}>{item.text}</div>
                {item.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    {item.description}
                  </div>
                )}
              </button>
            );
          })}
          {loading && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              ⏳ recherche…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
