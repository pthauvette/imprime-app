/**
 * /admin/templates/[slug]/edit — Admin template inspector (read-only MVP).
 *
 * Read-only inspection of a registry template + its DB shadow row :
 *   - Fields list extracted depuis template.pdfme.schemas[0]
 *   - HTML mockup de la carte avec sampleValues (pas de canvas WYSIWYG)
 *   - Métadonnées et stats d'usage
 *
 * L'édition réelle se fait dans le code (src/lib/templates/*.ts). On
 * branchera un vrai éditeur quand le besoin justifie la complexité.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { ALL_TEMPLATES, getTemplateBySlug } from '@/lib/templates/registry';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = getTemplateBySlug(slug);
  return {
    title: t ? `Admin — ${t.name} · Plio` : 'Admin — Template introuvable · Plio',
  };
}

// Schema field shape from pdfme — we only need a handful of keys to display
type SchemaField = {
  name: string;
  type?: string;
  position?: { x?: number; y?: number };
  width?: number;
  height?: number;
  readOnly?: boolean;
};

export default async function AdminTemplateEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  const { slug } = await params;
  const template = getTemplateBySlug(slug);
  if (!template) notFound();

  const [dbTemplate, usersCount, ordersCount, lastDesign] = await Promise.all([
    prisma.template.findUnique({
      where: { slug },
      include: { _count: { select: { designs: true } } },
    }),
    prisma.user.count(),
    prisma.order.count(),
    prisma.designDraft.findFirst({
      where: { template: { slug } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const designCount = dbTemplate?._count.designs ?? 0;
  const firstPage = (template.pdfme.schemas[0] ?? []) as SchemaField[];

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="templates"
        counts={{
          orders: ordersCount,
          users: usersCount,
          templates: ALL_TEMPLATES.length,
        }}
        user={
          session?.user
            ? {
                name: session.user.name ?? null,
                email: session.user.email ?? '',
                role: session.user.role,
              }
            : undefined
        }
      />

      <main className="adm-main">
        {/* ─── Topbar ─────────────────────────────────────────────── */}
        <header
          className="adm-topbar"
          style={{ alignItems: 'flex-start', gap: 24 }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <Link
              href={'/admin/templates' as Route}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 12,
              }}
            >
              ← Templates
            </Link>
            <h1 className="adm-page-title">{template.name}</h1>
            <p
              className="adm-page-subtitle"
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.04em',
                }}
              >
                {template.slug}
              </span>
              <span style={{ color: 'var(--border-default)' }}>·</span>
              <span>{template.description}</span>
            </p>
          </div>
          <div className="adm-topbar-actions">
            <Link
              href={`/design/${template.slug}` as Route}
              className="btn btn-secondary btn-sm"
              style={{ textDecoration: 'none' }}
            >
              Voir le rendu user →
            </Link>
            <button
              className="btn btn-primary btn-sm"
              disabled
              title="Édition de templates pas encore wirée"
            >
              Modifier
            </button>
          </div>
        </header>

        {/* ─── Banner : édition à venir ───────────────────────────── */}
        <div
          role="note"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '14px 16px',
            background: 'var(--warning-soft)',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--r-md)',
            marginBottom: 24,
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--text-primary)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--warning)',
              letterSpacing: '0.06em',
              padding: '3px 8px',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--r-pill)',
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            INFO
          </span>
          <div>
            <strong style={{ fontWeight: 600 }}>Édition complète à venir.</strong>{' '}
            Pour l&apos;instant, modifie ce template dans{' '}
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                padding: '1px 6px',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              src/lib/templates/business-cards.ts
            </code>{' '}
            (ou créer-en un nouveau dans le registry).
          </div>
        </div>

        {/* ─── 3-col layout : Champs / Aperçu / Métadonnées ──────── */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: '280px 1fr 320px',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* LEFT : Champs */}
          <aside className="adm-panel" style={{ alignSelf: 'start' }}>
            <header className="adm-panel-header">
              <h2 className="adm-panel-title">
                Champs{' '}
                <span
                  className="adm-panel-title-meta"
                  style={{ marginLeft: 4 }}
                >
                  ({firstPage.length})
                </span>
              </h2>
            </header>
            <div className="adm-panel-body" style={{ padding: 0 }}>
              {firstPage.length === 0 ? (
                <div
                  style={{
                    padding: 16,
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  Aucun champ sur la page 1.
                </div>
              ) : (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'grid',
                  }}
                >
                  {firstPage.map((f) => (
                    <FieldRow key={f.name} field={f} />
                  ))}
                </ul>
              )}
            </div>
          </aside>

          {/* CENTER : Aperçu HTML mockup */}
          <section
            style={{
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-lg)',
              padding: 32,
              display: 'grid',
              placeItems: 'center',
              minHeight: 360,
              position: 'relative',
            }}
          >
            <CardMockup template={template} />
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Aperçu HTML — approximation
            </div>
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                right: 12,
                display: 'flex',
                gap: 16,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
              }}
            >
              <span>
                <strong style={{ color: 'var(--text-secondary)' }}>
                  {template.variant}&quot;
                </strong>{' '}
                · CMYK 300 DPI · bleed 1/8&quot;
              </span>
              <span style={{ marginLeft: 'auto' }}>
                Rendu PDF réel via{' '}
                <code>POST /api/templates/{template.slug}/render</code>
              </span>
            </div>
          </section>

          {/* RIGHT : Métadonnées */}
          <aside className="adm-panel" style={{ alignSelf: 'start' }}>
            <header className="adm-panel-header">
              <h2 className="adm-panel-title">Métadonnées</h2>
            </header>
            <div className="adm-panel-body" style={{ padding: '8px 0' }}>
              <MetaRow label="Variant" value={template.variant} mono />
              <MetaRow label="Type produit" value={template.productType} mono />
              <MetaRow label="Côté" value={template.side} mono />
              <MetaRow
                label="Couleur accent"
                value={
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        background: template.accentColor,
                        border: '1px solid var(--border-default)',
                      }}
                    />
                    <code
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {template.accentColor}
                    </code>
                  </span>
                }
              />
              <MetaRow
                label="Tags"
                value={
                  <div
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}
                  >
                    {template.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          padding: '2px 6px',
                          background: 'var(--bg-sunken)',
                          color: 'var(--text-secondary)',
                          borderRadius: 'var(--r-sm)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                }
              />
              <MetaRow
                label="Produit Sinalite"
                value={`#${template.defaultSinalite.productId}`}
                mono
              />

              <div style={{ padding: '12px 16px 4px' }}>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    marginBottom: 6,
                  }}
                >
                  sampleValues
                </div>
                <pre
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-sunken)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-sm)',
                    padding: 10,
                    margin: 0,
                    overflowX: 'auto',
                  }}
                >
                  {JSON.stringify(template.sampleValues, null, 2)}
                </pre>
              </div>
            </div>
          </aside>
        </section>

        {/* ─── Usage stats ────────────────────────────────────────── */}
        <section
          className="adm-panel"
          style={{ marginBottom: 24 }}
        >
          <header className="adm-panel-header">
            <h2 className="adm-panel-title">
              Usage{' '}
              <span className="adm-panel-title-meta" style={{ marginLeft: 4 }}>
                stats DB
              </span>
            </h2>
            <span
              className="adm-section-meta"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {dbTemplate
                ? `template DB id : ${dbTemplate.id}`
                : 'shadow row pas encore créé'}
            </span>
          </header>
          <div
            className="adm-panel-body"
            style={{
              padding: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            <UsageStat
              label="Designs créés"
              value={String(designCount)}
              sub={designCount === 0 ? 'aucun encore' : 'depuis le launch'}
            />
            <UsageStat
              label="Dernier design"
              value={
                lastDesign?.createdAt
                  ? formatDateTime(lastDesign.createdAt)
                  : '—'
              }
              sub={lastDesign?.createdAt ? 'created_at' : 'jamais designé'}
            />
            <UsageStat
              label="Conversion design → order"
              value="—"
              sub="TODO : wirer DesignDraft ↔ Order"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function FieldRow({ field }: { field: SchemaField }) {
  const type = field.type ?? 'text';
  const isLine = type === 'line';
  const isRect = type === 'rectangle';
  const ico = isLine ? '▬' : isRect ? '▣' : 'T';
  const x = field.position?.x ?? 0;
  const y = field.position?.y ?? 0;
  const w = field.width ?? 0;
  const h = field.height ?? 0;

  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 1fr auto',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 12,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}
      >
        {ico}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-primary)',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {field.name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
            marginTop: 2,
          }}
        >
          {type} · {x}×{y} · {w}×{h} mm
        </div>
      </div>
      {field.readOnly && (
        <span
          title="Verrouillé"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '2px 5px',
            background: 'var(--bg-sunken)',
            borderRadius: 'var(--r-sm)',
          }}
        >
          lock
        </span>
      )}
    </li>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr',
        gap: 12,
        padding: '8px 16px',
        alignItems: 'flex-start',
        fontSize: 12,
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: 'var(--text-primary)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          fontSize: mono ? 11 : 12,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function UsageStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="adm-stat-card" style={{ padding: 14 }}>
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value" style={{ fontSize: 24 }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginTop: 4,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
        }}
      >
        {sub}
      </div>
    </div>
  );
}

/**
 * HTML approximation of the business card using sampleValues. Pas un vrai
 * rendu pdfme — juste assez fidèle pour visualiser la composition avant de
 * descendre dans le code.
 */
function CardMockup({
  template,
}: {
  template: NonNullable<ReturnType<typeof getTemplateBySlug>>;
}) {
  // Canvas dimensions in px — keep ratio aligned with 95.25 × 57.15 mm
  const SCALE = 4.2; // px per mm
  const W = 95.25 * SCALE;
  const H = 57.15 * SCALE;
  const fields = (template.pdfme.schemas[0] ?? []) as SchemaField[];
  const sample = template.sampleValues;

  return (
    <div
      style={{
        position: 'relative',
        width: W,
        height: H,
        background: '#fff',
        boxShadow: 'var(--shadow-lg)',
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid var(--border-default)',
      }}
    >
      {fields.map((f, idx) => {
        const type = f.type ?? 'text';
        const x = (f.position?.x ?? 0) * SCALE;
        const y = (f.position?.y ?? 0) * SCALE;
        const w = (f.width ?? 0) * SCALE;
        const h = (f.height ?? 0) * SCALE;
        // Pull fontSize / fontColor / color if present on the schema (loose typing)
        const raw = f as unknown as {
          fontSize?: number;
          fontColor?: string;
          color?: string;
          alignment?: 'left' | 'center' | 'right';
        };

        if (type === 'rectangle') {
          return (
            <div
              key={`${f.name}-${idx}`}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: w,
                height: h,
                background: raw.color ?? template.accentColor,
              }}
            />
          );
        }

        if (type === 'line') {
          return (
            <div
              key={`${f.name}-${idx}`}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: w,
                height: Math.max(h, 1),
                background: raw.color ?? template.accentColor,
              }}
            />
          );
        }

        // text
        const value = sample[f.name] ?? '';
        const fontPx = (raw.fontSize ?? 10) * (SCALE / 2.835); // pt → px-ish
        return (
          <div
            key={`${f.name}-${idx}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: w,
              height: h,
              color: raw.fontColor ?? '#1a1a1a',
              fontSize: fontPx,
              lineHeight: 1.1,
              textAlign: raw.alignment ?? 'left',
              fontFamily: template.tags.includes('serif')
                ? 'Georgia, serif'
                : 'Inter, system-ui, sans-serif',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {value}
          </div>
        );
      })}
    </div>
  );
}
