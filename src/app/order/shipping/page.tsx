/**
 * /order/shipping?productId=N&options=...&files=... — Step 6 wizard.
 *
 * Form complet (contact + adresse CA) + auto-fetch des méthodes de
 * livraison via POST /api/shipping/estimate dès que la province + code
 * postal sont valides.
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useState, useEffect, useMemo, Suspense } from 'react';
import type { CaProvince } from '@/lib/sinalite/types';
import { readSavedShip, writeSavedShip } from '@/lib/cart/ship-store';
import AddressAutocomplete from '@/components/order/AddressAutocomplete';

const CA_PROVINCES: { code: CaProvince; name: string }[] = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'Colombie-Britannique' },
  { code: 'MB', name: 'Manitoba' }, { code: 'NB', name: 'Nouveau-Brunswick' },
  { code: 'NL', name: 'Terre-Neuve-et-Labrador' }, { code: 'NS', name: 'Nouvelle-Écosse' },
  { code: 'NT', name: 'Territoires du Nord-Ouest' }, { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Île-du-Prince-Édouard' },
  { code: 'QC', name: 'Québec' }, { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

interface ShippingMethod {
  carrier: string;
  method: string;
  price: number;
  days: number;
  eta: string;
}

const POSTAL_REGEX = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

export default function ShippingPage() {
  // useSearchParams() oblige un Suspense boundary en build (CSR bailout).
  return (
    <Suspense fallback={null}>
      <ShippingPageInner />
    </Suspense>
  );
}

function ShippingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const options = searchParams.get('options') ?? '';
  const files = searchParams.get('files') ?? '';

  // Form state
  // Init avec strings vides — on hydrate depuis localStorage dans useEffect
  // pour éviter hydration mismatch SSR/CSR. Si localStorage absent, le user
  // tape ses infos. Si présent (multi-item ou commande précédente), pré-rempli.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState<CaProvince>('QC');
  const [postalCode, setPostalCode] = useState('');

  // Hydrate depuis localStorage au mount (post-hydration pour éviter mismatch)
  useEffect(() => {
    const saved = readSavedShip();
    if (saved) {
      setFirstName(saved.firstName);
      setLastName(saved.lastName);
      setEmail(saved.email);
      setPhone(saved.phone);
      setLine1(saved.line1);
      setLine2(saved.line2);
      setCity(saved.city);
      setProvince(saved.province as CaProvince);
      setPostalCode(saved.postalCode);
    }
  }, []);

  // Shipping estimate state
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  const postalValid = POSTAL_REGEX.test(postalCode);
  const contactValid = firstName && lastName && email.includes('@') && phone;

  // Parse options for the API call
  const optionsByName = useMemo(() => {
    const ids = options.split(',').filter(Boolean).map(Number);
    // Sinalite expects optionsByName { "Stock": "30", "size": "4", ... }
    // We don't have group names here, but the API accepts the raw IDs map too.
    // Use generic "opt_N": id mapping that the BFF will resolve.
    const map: Record<string, string> = {};
    ids.forEach((id, i) => { map[`opt_${i}`] = String(id); });
    return map;
  }, [options]);

  // Auto-fetch shipping methods when address is valid
  useEffect(() => {
    if (!postalValid || !province || !productId) {
      setMethods([]);
      return;
    }
    let cancelled = false;
    const fetchMethods = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/shipping/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ productId: Number(productId), options: optionsByName }],
            shippingInfo: { ShipState: province, ShipZip: postalCode, ShipCountry: 'CA' },
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Erreur réseau' }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setMethods(data.methods);
          if (data.methods[0]) setSelectedMethod(data.methods[0].method);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchMethods();
    return () => { cancelled = true; };
  }, [postalValid, province, postalCode, productId, optionsByName]);

  const canContinue = contactValid && postalValid && selectedMethod && methods.length > 0;
  const selectedShippingPrice = methods.find((m) => m.method === selectedMethod)?.price ?? 0;

  const nextHref = canContinue
    ? `/order/review?productId=${productId}&options=${options}&files=${files}&ship=${encodeURIComponent(
        JSON.stringify({
          firstName, lastName, email, phone,
          line1, line2, city, province, postalCode,
          method: selectedMethod, price: selectedShippingPrice,
        }),
      )}` as Route
    : null;
  const prevHref = `/order/upload?productId=${productId}&options=${options}` as Route;

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>Plio.</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb">Adresse & livraison</span>
        </div>
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuenow={6} aria-valuemin={1} aria-valuemax={7}>
            <div className="progress-segment done"></div><div className="progress-segment done"></div>
            <div className="progress-segment done"></div><div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 06 sur 07 — Livraison</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <button className="btn btn-ghost btn-sm">⌘ K</button>
        </div>
      </header>

      <main className="step-layout">
        <div className="step-content" style={{ padding: '56px 80px', maxWidth: 880 }}>
          <div className="step-eyebrow">Étape 06</div>
          <h1 className="step-question">On l'envoie <em>où ?</em></h1>
          <p className="step-lede">
            Livraison partout au Canada en 1 à 7 jours selon le carrier choisi.
          </p>

          <Section roman="I." title="Contact">
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Prénom" value={firstName} onChange={setFirstName} />
                <Field label="Nom" value={lastName} onChange={setLastName} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Email" value={email} onChange={setEmail} type="email" />
                <Field label="Téléphone" value={phone} onChange={setPhone} type="tel" />
              </div>
            </div>
          </Section>

          <Section roman="II." title="Adresse d'expédition">
            <div style={{ display: 'grid', gap: 16 }}>
              <FieldWrapper label="Adresse">
                <AddressAutocomplete
                  value={line1}
                  onChange={setLine1}
                  onSelect={(addr) => {
                    setLine1(addr.line1);
                    if (addr.line2) setLine2(addr.line2);
                    if (addr.city) setCity(addr.city);
                    if (addr.province) {
                      const code = addr.province as CaProvince;
                      setProvince(code);
                    }
                    if (addr.postalCode) setPostalCode(addr.postalCode);
                  }}
                />
              </FieldWrapper>
              <Field label="Adresse 2 (suite, app, unité — optionnel)" value={line2} onChange={setLine2} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 160px', gap: 12 }}>
                <Field label="Ville" value={city} onChange={setCity} />
                <FieldWrapper label="Province">
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value as CaProvince)}
                    style={{
                      width: '100%', border: 0, background: 'transparent',
                      font: 'inherit', color: 'var(--text-primary)', outline: 'none',
                    }}
                  >
                    {CA_PROVINCES.map((p) => (
                      <option key={p.code} value={p.code}>{p.code} — {p.name}</option>
                    ))}
                  </select>
                </FieldWrapper>
                <FieldWrapper label="Code postal" error={postalCode && !postalValid ? 'Format A1A 1A1' : null}>
                  <input
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value.toUpperCase())}
                    placeholder="A1A 1A1"
                    maxLength={7}
                    style={{ width: '100%', border: 0, background: 'transparent', font: 'inherit', color: 'var(--text-primary)', outline: 'none', textTransform: 'uppercase' }}
                  />
                </FieldWrapper>
              </div>
            </div>
          </Section>

          <Section roman="III." title="Méthode de livraison">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                Estimés depuis Markham, ON
              </span>
            </div>

            {!postalValid ? (
              <PromptCard message="Entre un code postal valide pour voir les méthodes disponibles." />
            ) : loading ? (
              <PromptCard message="⏳ Calcul des méthodes de livraison…" />
            ) : error ? (
              <PromptCard message={`❌ Erreur : ${error}`} variant="danger" />
            ) : methods.length === 0 ? (
              <PromptCard message="Aucune méthode disponible pour cette adresse." />
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {methods.map((m, i) => (
                  <ShippingRow
                    key={m.method}
                    method={m}
                    selected={selectedMethod === m.method}
                    recommended={i === 0}
                    onClick={() => setSelectedMethod(m.method)}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside className="recap">
          <div>
            <div className="recap-section-label">Ta commande</div>
            <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <div>Produit #{productId}</div>
              <div>Options: {options.split(',').length} sélections</div>
              <div>Fichiers: {files.split('|').filter(Boolean).length} uploadé(s)</div>
            </div>
          </div>
          <div>
            <div className="recap-section-label">Livraison</div>
            <div style={{ marginTop: 12, padding: 14, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', fontSize: 13 }}>
              <strong style={{ display: 'block', fontWeight: 600 }}>{firstName} {lastName}</strong>
              <span style={{ color: 'var(--text-secondary)' }}>
                {line1}{line2 ? `, ${line2}` : ''}<br />
                {city}, {province} {postalCode}
              </span>
              {selectedMethod && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-muted)' }}>
                  🚚 <strong style={{ color: 'var(--text-primary)' }}>{selectedMethod}</strong> · {selectedShippingPrice.toFixed(2)} $
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>

      <footer className="shell-footer">
        <div>
          <Link href={prevHref} className="btn btn-ghost">
            <span style={{ fontFamily: 'var(--font-mono)' }}>←</span> Précédent
          </Link>
        </div>
        <div className="shell-footer-center">↵ Entrée pour continuer</div>
        <div className="shell-footer-right">
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!nextHref) return;
              // Persist le ship pour pré-remplir au prochain passage du
              // wizard (cas multi-item où l'user ajoute un 2e produit).
              // Auto-cleared sur /order/confirmation.
              writeSavedShip({ firstName, lastName, email, phone, line1, line2, city, province, postalCode });
              // Capture abandoned-cart : on a l'email + on quitte shipping
              // pour review. Cron envoie un recovery 24h+ après si pas
              // de checkout. Best-effort fire-and-forget — pas d'await
              // pour pas bloquer le router.push.
              if (productId && email.includes('@')) {
                const resumeParams = new URLSearchParams({
                  options,
                  files,
                  ship: JSON.stringify({
                    firstName, lastName, email, phone,
                    line1, line2, city, province, postalCode,
                    method: selectedMethod, price: selectedShippingPrice,
                  }),
                });
                void fetch('/api/abandoned-cart', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email,
                    productId: Number(productId),
                    resumeQuery: resumeParams.toString(),
                    lastStep: 'shipping',
                  }),
                  // keepalive : permet à la requête de survivre à la
                  // navigation router.push qui va suivre immédiatement.
                  keepalive: true,
                }).catch(() => {
                  // Silencieux : on n'embête pas le user si le tracker fail
                });
              }
              router.push(nextHref);
            }}
            disabled={!canContinue}
            style={{ opacity: canContinue ? 1 : 0.4, cursor: canContinue ? 'pointer' : 'not-allowed' }}
          >
            Récapitulatif & paiement <kbd>↵</kbd>
          </button>
        </div>
      </footer>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────

function Section({ roman, title, children }: { roman: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 16, marginBottom: 20, alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>
          {roman}
        </span>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.01em', margin: 0, fontWeight: 400 }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <FieldWrapper label={label}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', border: 0, background: 'transparent', font: 'inherit', color: 'var(--text-primary)', outline: 'none' }}
      />
    </FieldWrapper>
  );
}

function FieldWrapper({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <div className={`field${error ? ' field-error' : ''}`}>
        <label>{label}</label>
        {children}
      </div>
      {error && <div className="field-helper error">{error}</div>}
    </div>
  );
}

function PromptCard({ message, variant = 'info' }: { message: string; variant?: 'info' | 'danger' }) {
  const bg = variant === 'danger' ? 'var(--danger-soft)' : 'var(--bg-canvas)';
  const border = variant === 'danger' ? 'var(--danger)' : 'var(--border-default)';
  return (
    <div
      style={{
        padding: '24px 20px',
        background: bg,
        border: `1px dashed ${border}`,
        borderRadius: 'var(--r-md)',
        fontSize: 14,
        color: 'var(--text-secondary)',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}

function ShippingRow({ method, selected, recommended, onClick }: { method: ShippingMethod; selected: boolean; recommended: boolean; onClick: () => void }) {
  const date = new Date(method.eta);
  const eta = date.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <button
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr auto auto',
        gap: 20,
        alignItems: 'center',
        padding: selected ? '17px 23px' : '18px 24px',
        background: selected ? 'linear-gradient(90deg, var(--accent-soft) 0%, var(--bg-surface) 30%)' : 'var(--bg-surface)',
        border: `${selected ? 2 : 1}px solid ${selected ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        borderRadius: 'var(--r-lg)',
        cursor: 'pointer',
        boxShadow: selected ? '0 0 0 4px color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'var(--shadow-xs)',
        transition: 'all 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.04em',
          padding: '8px 12px',
          background: selected ? 'var(--accent-primary)' : 'var(--bg-sunken)',
          color: selected ? 'var(--text-on-accent)' : 'var(--text-secondary)',
          borderRadius: 'var(--r-sm)',
          textAlign: 'center',
        }}
      >
        {method.carrier.includes('UPS') || method.carrier === 'UPS' ? 'UPS' : 'FedEx'}
      </div>
      <div>
        <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>
          {method.method}
          {recommended && (
            <span style={{ display: 'inline-flex', padding: '2px 8px', background: 'var(--success-soft)', color: 'var(--success)', borderRadius: 'var(--r-pill)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginLeft: 8 }}>
              Le plus populaire
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
          {eta} · {method.days} jour{method.days > 1 ? 's' : ''} ouvrable{method.days > 1 ? 's' : ''}
        </div>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>
        {method.price.toFixed(2)} $
      </span>
      <span
        style={{
          width: 22, height: 22,
          border: `2px solid ${selected ? 'var(--accent-primary)' : 'var(--border-default)'}`,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {selected && <span style={{ width: 10, height: 10, background: 'var(--accent-primary)', borderRadius: '50%' }} />}
      </span>
    </button>
  );
}
