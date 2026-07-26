/**
 * /samples — page publique pour demander un kit d'échantillons gratuits.
 *
 * Server Component qui rend la grille des samples (catalogue hardcodé —
 * les samples physiques ne changent pas souvent + pas de lien direct
 * Sinalite). Le formulaire de demande est un Client Component dans
 * SamplesForm avec selection + shipping form + submit.
 *
 * Conversion lead → vente : ~25-35 % typique pour ce type de tool.
 * On collect l'email + adresse → admin peut suivre + upseller plus tard.
 */

import SamplesForm, { type SampleOption } from './SamplesForm';
import { getServerLocale } from '@/lib/i18n/locale';
import { Icon } from '@/components/ui/Icon';

export const metadata = {
  title: 'Échantillons gratuits — Plio',
  description: 'Reçois jusqu\'à 5 échantillons physiques gratuits par mois. Touche, compare, choisis le bon papier pour ton projet. Livré au Canada en 5 jours.',
};
export const dynamic = 'force-dynamic';

// Catalogue des échantillons disponibles. Édité ici manuellement quand on
// ajoute/retire un sample. Pas en DB pour MVP — simple + statique.
const PAPERS: SampleOption[] = [
  { key: '14pt Coated', name: '14pt Coated', desc: 'Le standard. Surface lisse, durable, excellent rendu CMYK.', spec: '14pt · 350 g/m² · couché brillant', swatchClass: 'coated14' },
  { key: '16pt Coated', name: '16pt Coated', desc: 'Plus épais que le standard. Meilleur ressenti premium.', spec: '16pt · 400 g/m² · couché brillant', swatchClass: 'coated16' },
  { key: '16pt Soft Touch', name: '16pt Soft Touch', desc: 'Sensation veloutée unique. L\'option signature.', spec: '16pt · 400 g/m² · pelliculage soft touch', swatchClass: 'soft', badge: '★ Coup de cœur' },
  { key: '14pt Matte', name: '14pt Matte Finish', desc: 'Finition mate sans reflet. Idéal pour la photo sombre.', spec: '14pt · 350 g/m² · finition mate', swatchClass: 'matte' },
  { key: 'Kraft naturel', name: 'Kraft naturel', desc: 'Papier recyclé brun. Esthétique artisanale, engagement écologique.', spec: '18pt · 100 % recyclé · non couché', swatchClass: 'kraft', badge: 'Eco' },
  { key: 'Linen', name: 'Linen (texture lin)', desc: 'Texture tissée. Donne une sensation tactile distinctive.', spec: '320 g/m² · texture lin gaufré', swatchClass: 'linen' },
];

const FINISHES: SampleOption[] = [
  { key: 'UV High Gloss', name: 'UV High Gloss', desc: 'Brillant éclatant, couleurs saturées. Notre finition la plus polyvalente.', spec: 'Coating UV haute brillance · pleine surface', swatchClass: 'uv' },
  { key: 'Spot UV', name: 'Spot UV', desc: 'Vernis sélectif sur zones précises (logo, typo). Effet contraste mat/brillant.', spec: 'UV ciblé · gabarit vectoriel requis', swatchClass: 'spotuv' },
  { key: 'Foil or', name: 'Foil métallique (or)', desc: 'Estampage à chaud. Disponible en or, argent, cuivre, holo.', spec: 'Stamping or 24K · effet luxe haut de gamme', swatchClass: 'foil', badge: 'Premium' },
  { key: 'Foil holographique', name: 'Foil holographique', desc: 'Reflets arc-en-ciel changeants selon l\'angle. Effet futuriste.', spec: 'Stamping iridescent · 7 motifs disponibles', swatchClass: 'holographic', badge: 'Nouveau' },
];

export default async function SamplesPage() {
  // Locale pour l'instant pas wired sur cette page — message hint fr par
  // défaut. Migration EN à faire au besoin.
  await getServerLocale();

  return (
    <div className="samples-shell">
      <header className="samples-header">
        <div className="page-eyebrow">Échantillons gratuits</div>
        <h1 className="samples-title">
          Touche, regarde, <em>compare.</em>
        </h1>
        <p className="samples-lede">
          Reçois jusqu&apos;à <strong>5 échantillons physiques par mois</strong> — gratuits,
          sans engagement, livrés en 5 jours par Postes Canada partout au Canada.
        </p>
      </header>

      <SamplesForm
        papers={PAPERS}
        finishes={FINISHES}
        max={5}
      />

      <section
        className="samples-hint"
        style={{
          marginTop: 40,
          padding: 22,
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent-primary)',
          borderRadius: 'var(--r-md)',
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <Icon name="info" size={14} /> <strong>Pro tip :</strong> les pros commandent toujours leurs échantillons avant
        le premier projet. Touche le 16pt soft touch — tu vas comprendre pourquoi c'est
        notre option signature.
      </section>
    </div>
  );
}
