/**
 * loading.tsx — squelette du CONFIGURATEUR.
 *
 * POURQUOI ICI, ET NULLE PART AILLEURS DANS LE TUNNEL. Mesuré en production
 * (TTFB, deux passes, cinq produits différents) :
 *
 *   /order/start                    0,27 – 0,50 s
 *   /order/product?category=…       0,31 s
 *   /order/v/[slug]                 0,24 – 0,32 s
 *   /compare?ids=…                  0,27 – 0,48 s
 *   /order/configure?productId=…    **2,86 – 3,35 s à froid**  ← ici
 *
 * Le configurateur est LA page lente du parcours, et c'est aussi celle où le
 * client choisit son produit et découvre son prix. Il construit l'index de
 * variantes Sinalite (budget 2,5 s, cf. `lib/sinalite/pricing.ts`) plus le
 * détail produit et la marge admin. Sans squelette, Next garde la page
 * PRÉCÉDENTE affichée pendant ~3 s : rien ne bouge, aucun retour, et le client
 * ne sait pas si son clic a été pris.
 *
 * Sur les autres étapes, un squelette qui clignote 300 ms serait PIRE que rien
 * — d'où l'absence délibérée de `loading.tsx` ailleurs. C'est la mesure qui
 * décide, pas le principe.
 *
 * On réutilise les CLASSES RÉELLES de la page (`shell`, `shell-header`…) : la
 * géométrie correspond alors par construction, et le contenu ne « saute » pas
 * au remplacement. Idiome `block()` repris de `/admin/loading.tsx`.
 */

const block = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: 'var(--bg-sunken)',
  borderRadius: 'var(--r-sm)',
  animation: 'pulse 1.5s ease-in-out infinite',
  ...extra,
});

export default function ConfigureLoading() {
  return (
    <div className="shell" aria-busy="true" aria-label="Chargement du configurateur…">
      <header className="shell-header">
        <div className="shell-header-left">
          <span className="wordmark">Plio.</span>
          <span className="breadcrumb-sep">/</span>
          <div style={block({ width: 180, height: 14 })} />
        </div>
        {/* La barre de progression fait partie de l'EN-TÊTE de la vraie page.
            Sans elle, le squelette mesurait 68 px contre 166 px : à l'arrivée du
            contenu, tout sautait de ~98 px vers le bas, juste sous les yeux du
            client. On la rend pour de vrai — elle est statique et connue
            (étape 3 sur 6), donc rien à deviner. */}
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuenow={3} aria-valuemin={1} aria-valuemax={6}>
            <div className="progress-segment done" />
            <div className="progress-segment done" />
            <div className="progress-segment active" />
            <div className="progress-segment" />
            <div className="progress-segment" />
            <div className="progress-segment" />
          </div>
          <div className="progress-label">Étape 03 sur 06 — Configuration &amp; quantité</div>
        </div>
        <div className="shell-header-right">
          <div style={block({ width: 90, height: 24, borderRadius: 'var(--r-pill)' })} />
        </div>
      </header>

      <main className="step-layout">
        <div className="step-content" style={{ maxWidth: 1080 }}>
        <div style={block({ width: 220, height: 22, borderRadius: 'var(--r-pill)', marginBottom: 16 })} />
        <div style={block({ width: 'min(420px, 80%)', height: 44, marginBottom: 12 })} />
        <div style={block({ width: 'min(520px, 92%)', height: 16, marginBottom: 32 })} />

        {/* Aperçu du produit — le grand bloc en haut de la vraie page. */}
        <div style={block({ height: 220, borderRadius: 'var(--r-lg)', marginBottom: 36 })} />

        {/* Trois groupes d'options : format, faces, quantité. Assez pour que la
            hauteur du squelette approche celle de la vraie page. */}
        {Array.from({ length: 3 }).map((_, i) => (
          <section key={i} style={{ marginBottom: 36 }}>
            <div style={block({ width: 160, height: 18, marginBottom: 8 })} />
            <div style={block({ width: 120, height: 12, marginBottom: 16 })} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {Array.from({ length: 4 }).map((__, j) => (
                <div key={j} style={block({ height: 96, borderRadius: 'var(--r-lg)' })} />
              ))}
            </div>
          </section>
        ))}
        </div>
      </main>
    </div>
  );
}
