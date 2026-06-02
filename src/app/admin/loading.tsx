/**
 * loading.tsx — skeleton affiché pendant le chargement des pages /admin/*.
 *
 * Les pages admin sont `force-dynamic` avec des requêtes Prisma lourdes
 * (agrégations finances, listes commandes/users). Sans ce fichier, Next
 * n'affichait rien jusqu'à la résolution du Server Component → impression de
 * gel. Ce skeleton générique (barre de titre + cartes KPI + lignes de tableau)
 * couvre la majorité des layouts admin. `pulse` = @keyframes global (opacity).
 */

const block = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: 'var(--bg-sunken, #ECEAE3)',
  borderRadius: 'var(--r-sm, 6px)',
  animation: 'pulse 1.5s ease-in-out infinite',
  ...extra,
});

export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Chargement…" style={{ padding: '32px 24px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Titre */}
      <div style={block({ width: 240, height: 32, marginBottom: 8 })} />
      <div style={block({ width: 360, height: 16, marginBottom: 28 })} />

      {/* Cartes KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--border-subtle, #ECEAE3)',
              borderRadius: 'var(--r-md, 10px)',
              padding: 18,
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={block({ width: '60%', height: 12 })} />
            <div style={block({ width: '40%', height: 28 })} />
          </div>
        ))}
      </div>

      {/* Lignes de tableau */}
      <div style={{ display: 'grid', gap: 10 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={block({ height: 44 })} />
        ))}
      </div>
    </div>
  );
}
