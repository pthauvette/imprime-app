/**
 * Noms MARKETING des produits — la couche français-client au-dessus du
 * catalogue Sinalite.
 *
 * LE PROBLÈME — Sinalite nomme ses produits pour SES opérateurs, en anglais et
 * avec son jargon d'atelier : « Business cards 14pt (Profit Maximizer) »,
 * « 60lb slit back label / Stickers », « H Stand ( for signs) ». Ces libellés
 * arrivaient tels quels dans le picker et le configurateur, sur un site qui
 * promet pourtant du « service bilingue, jamais traduit à la machine »
 * (/about). « Profit Maximizer » est un nom de PALIER DE MARGE — un client n'a
 * aucune raison de le lire.
 *
 * CLÉ = productId, PAS le nom. Les noms Sinalite changent au fil des refontes
 * de leur catalogue ; l'id est la clé de jointure stable, déjà utilisée partout
 * dans le code (variantIndex, ProductOverride.sinaliteProductId, payload de
 * commande). Un renommage chez eux ne casse donc rien ici.
 *
 * ORDRE DE PRÉCÉDENCE (cf. applyProductOverrides) :
 *   1. ProductOverride.displayName — l'admin, en DB, sans redéploiement
 *   2. MARKETING_NAMES — ce fichier, versionné et relisible en PR
 *   3. le nom Sinalite brut — repli
 *
 * REPLI ASSUMÉ : un produit absent de cette table garde son nom Sinalite. On
 * n'invente JAMAIS un nom par heuristique (règles de dérivation type
 * « enlève le poids du papier ») : Sinalite ajoute des SKU sans préavis, et une
 * heuristique produirait un jour un nom faux sur une vraie fiche produit — pire
 * qu'un nom anglais honnête. Un produit inconnu se voit dans l'UI et se corrige
 * ici en une ligne.
 *
 * NON couvert volontairement : les produits VIRTUELS (cartes de visite, flyers,
 * cartes postales…) portent déjà un nom français défini dans virtual-products.ts
 * — ils ne passent pas par cette table.
 */

export interface MarketingName {
  /** Nom affiché au client. */
  name: string;
  /** Sous-texte : ce que le produit EST et à quoi il sert, sans jargon. */
  desc: string;
}

/**
 * Table curée, groupée par famille du catalogue (cf. lib/catalogue.ts).
 *
 * Les caractéristiques techniques (14 pt, 13 oz, 4 mm) sont CONSERVÉES : en
 * impression elles sont un critère de comparaison réel, pas du jargon. Ce qu'on
 * retire, c'est le vocabulaire interne fournisseur et l'anglais.
 */
export const MARKETING_NAMES: Record<number, MarketingName> = {
  // ── Cartes de visite ────────────────────────────────────────────────────
  124: { name: 'Carte de visite pliante — UV brillant', desc: '14 pt · couleurs saturées, effet vitrine' },
  125: { name: 'Carte de visite pliante — mat', desc: '14 pt · toucher doux, sans reflet' },
  126: { name: 'Carte de visite pliante — écologique', desc: '13 pt non couché · recyclé, inscriptible au stylo' },
  7324: { name: 'Carte de visite — dorure métallique', desc: 'Feuille or ou argent appliquée à chaud' },
  7557: { name: 'Carte de visite — forme découpée', desc: 'Découpe sur mesure : coins, silhouettes, formes libres' },
  14986: { name: 'Carte de visite — tranche colorée', desc: '32 pt · épaisseur double, tranche peinte' },

  // ── Papeterie ───────────────────────────────────────────────────────────
  63: { name: 'Calendrier mural — papier standard', desc: '80 lb glacé · 12 mois' },
  64: { name: 'Calendrier mural — papier épais', desc: '100 lb glacé · plus rigide, rendu premium' },
  80: { name: 'Papier à en-tête', desc: '60 lb non couché · se réimprime au bureau, s’écrit au stylo' },
  81: { name: 'Enveloppe standard', desc: '60 lb non couché · rabat à humecter' },
  82: { name: 'Bloc-notes 25 feuilles', desc: '60 lb non couché · collé en tête' },
  83: { name: 'Bloc-notes 50 feuilles', desc: '60 lb non couché · collé en tête' },
  4165: { name: 'Enveloppe de sécurité', desc: 'Trame intérieure opaque · documents confidentiels' },
  4902: { name: 'Chevalet de table', desc: '14 pt mat · autoportant, imprimé des deux côtés' },
  5547: { name: 'Formulaire autocopiant', desc: 'Liasses 2 ou 3 feuillets · factures, bons de travail' },
  5585: { name: 'Enveloppe autocollante', desc: '60 lb · bande adhésive, rien à humecter' },
  7550: { name: 'Carte de souhaits — dorure métallique', desc: 'Feuille or ou argent appliquée à chaud' },
  7551: { name: 'Carte de souhaits — vernis sélectif', desc: 'Vernis brillant localisé sur fond mat' },
  7552: { name: 'Carte de souhaits — papier perlé', desc: 'Reflet nacré · mariages, fêtes' },
  7553: { name: 'Carte de souhaits — papier kraft', desc: 'Fibre naturelle brune · rendu artisanal' },

  // ── Étiquettes & stickers ───────────────────────────────────────────────
  62: { name: 'Aimant publicitaire', desc: '14 pt · frigo, classeur, porte métallique' },
  77: { name: 'Statique transparent', desc: 'Sans colle · se repositionne sur une vitre' },
  78: { name: 'Statique opaque', desc: 'Sans colle · fond blanc couvrant' },
  96: { name: 'Autocollant à la feuille', desc: '60 lb · dos fendu, découpe carrée' },
  104: { name: 'Aimant de voiture', desc: '30 mil · portière, résiste au lave-auto' },
  206: { name: 'Vinyle perforé pour vitrine', desc: 'Visible de l’extérieur, transparent de l’intérieur' },
  4139: { name: 'Vinyle adhésif brillant', desc: 'Autocollant durable · intérieur et extérieur' },
  7028: { name: 'Étiquette en rouleau — BOPP', desc: 'Plastique résistant à l’eau · pots, bouteilles' },
  7029: { name: 'Étiquette en rouleau — polyester', desc: 'Très résistante · congélation, produits chimiques' },
  7030: { name: 'Étiquette en rouleau — papier', desc: 'Économique · usage intérieur, pose à la main' },
  7555: { name: 'Décalque mural repositionnable', desc: '7 mil · se retire sans abîmer la peinture' },
  14672: { name: 'Autocollant de plancher — distanciation', desc: 'Antidérapant · marquage de file d’attente' },
  14676: { name: 'Autocollant de plancher', desc: 'Antidérapant · signalétique au sol' },
  14981: { name: 'Aimant découpé sur mesure — 30 mil', desc: 'Épais · forme libre, tenue ferme' },
  14985: { name: 'Aimant découpé sur mesure — 20 mil', desc: 'Plus mince et plus économique' },

  // ── Bannières & grand format ────────────────────────────────────────────
  75: { name: 'Panneau plastique 14 pt', desc: 'Léger et lavable · affichage intérieur' },
  97: { name: 'Pancarte coroplaste 4 mm', desc: 'Panneau alvéolaire · pelouse, élection, à vendre' },
  98: { name: 'Pancarte coroplaste 6 mm', desc: 'Plus rigide · usage prolongé' },
  99: { name: 'Pancarte coroplaste 8 mm', desc: 'Très rigide · grands formats' },
  14975: { name: 'Pancarte coroplaste 10 mm', desc: 'Épaisseur maximale · panneaux hors norme' },
  100: { name: 'Carton-mousse 4 mm', desc: 'Léger et rigide · présentation, salon intérieur' },
  101: { name: 'Bannière vinyle brillante 13 oz', desc: 'Couleurs vives · extérieur, œillets au choix' },
  102: { name: 'Bannière vinyle mate 13 oz', desc: 'Sans reflet · idéale sous éclairage' },
  7554: { name: 'Bannière ajourée (mesh) 8 oz', desc: 'Laisse passer le vent · clôture, façade' },
  103: { name: 'Bannière rétractable — base argent', desc: 'Support inclus · montage en 30 secondes' },
  202: { name: 'Bannière rétractable premium', desc: 'Mécanisme renforcé · usage fréquent' },
  7547: { name: 'Bannière rétractable de table', desc: 'Format comptoir · kiosque, salon' },
  7548: { name: 'Bannière rétractable large — premium', desc: 'Plus large · fond de kiosque' },
  7549: { name: 'Bannière rétractable double face', desc: 'Imprimée des deux côtés · allée passante' },
  15193: { name: 'Bannière rétractable — base noire', desc: '31,5 × 78,75 po · fini mat' },
  111: { name: 'Bannière sur support X', desc: 'Structure légère · se transporte à la main' },
  105: { name: 'Affiche grand format', desc: '8 pt · murs, vitrines, événements' },
  106: { name: 'Panneau styrène 20 pt', desc: 'Rigide et lisse · intérieur, réutilisable' },
  110: { name: 'Panneau Sintra 3 mm', desc: 'PVC expansé · rigide, tient dehors' },
  14978: { name: 'Panneau aluminium 3 mm', desc: 'Composite · extérieur permanent, ne rouille pas' },
  112: { name: 'Pancarte pour chevalet A', desc: 'Coroplaste 4 mm · trottoir, entrée de commerce' },
  122: { name: 'Chevalet A', desc: 'Structure seule · double face, se replie' },
  121: { name: 'Support en H', desc: 'Tige métallique · pour pancarte de pelouse' },
  14987: { name: 'Nappe imprimée — table 6 pi', desc: 'Lavable · kiosque, salon commercial' },
  14988: { name: 'Nappe imprimée — table 8 pi', desc: 'Lavable · kiosque, salon commercial' },

  // ── Photo & décor ───────────────────────────────────────────────────────
  107: { name: 'Panneau d’exposition 24 pt', desc: 'Rigide · présentoir, affichage comptoir' },
  108: { name: 'Panneau d’exposition 40 pt', desc: 'Épais et très rigide · grands panneaux' },
  109: { name: 'Toile d’artiste en rouleau', desc: 'Canevas · reproduction photo, à encadrer' },
  120: { name: 'Boîte de rangement imprimée', desc: 'Carton monté · rangement, envoi de kits' },
};

/**
 * Libellés français des CATÉGORIES Sinalite (le « Catégorie : … » des fiches).
 *
 * Sinalite expose ici sa propre taxonomie interne, doublons compris : certaines
 * catégories existent en double avec un tiret final (« Pull Up Banners » ET
 * « Pull Up Banners- »), séquelle de leur back-office. On mappe les DEUX vers le
 * même libellé français plutôt que de nettoyer la chaîne à la volée — un
 * `trim()` sur tiret masquerait le jour où Sinalite introduit une catégorie
 * réellement différente ne différant que par la ponctuation.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  'Folded Business Cards': 'Cartes pliantes',
  'Specialty Business Cards': 'Cartes spécialité',
  'Wall Calendars': 'Calendriers',
  Letterhead: 'Papier à en-tête',
  Envelopes: 'Enveloppes',
  Notepads: 'Blocs-notes',
  'Tent Cards': 'Chevalets de table',
  'NCR Forms': 'Formulaires autocopiants',
  'Specialty Greeting Cards': 'Cartes de souhaits spécialité',
  Magnets: 'Aimants',
  Clings: 'Statiques',
  'Square Cut Labels / Stickers': 'Étiquettes à la feuille',
  'Roll Labels / Stickers': 'Étiquettes en rouleau',
  'Car Magnets': 'Aimants de voiture',
  'Window Graphics': 'Vitrophanie',
  'Adhesive Vinyl': 'Vinyle adhésif',
  'Wall Decals': 'Décalques muraux',
  'Floor Graphics': 'Graphiques de plancher',
  'Covid-19-Decals-': 'Marquage au sol',
  Plastics: 'Panneaux plastique',
  'Coroplast Signs & Yard Signs': 'Pancartes coroplaste',
  'Coroplast Signs & Yard Signs-': 'Pancartes coroplaste',
  'Foam Board': 'Carton-mousse',
  'Vinyl Banners': 'Bannières vinyle',
  'Pull Up Banners': 'Bannières rétractables',
  'Pull Up Banners-': 'Bannières rétractables',
  'X-Frame Banners': 'Bannières sur support X',
  'Large Format Posters': 'Affiches grand format',
  'Styrene Signs': 'Panneaux styrène',
  'Sintra/Rigid Board': 'Panneaux rigides',
  'Aluminum Signs': 'Panneaux aluminium',
  'A-Frame Signs': 'Pancartes pour chevalet',
  'A Frame Stands': 'Chevalets',
  'H Stands for Signs': 'Supports de pancarte',
  'Table Covers': 'Nappes imprimées',
  'Display Board / POP': 'Panneaux d’exposition',
  Canvas: 'Toiles',
  'Supply Boxes': 'Boîtes',
};

/** Nom marketing d'un produit, ou `undefined` si non curé (→ repli appelant). */
export function marketingNameFor(productId: number): MarketingName | undefined {
  return MARKETING_NAMES[productId];
}

/** Libellé français d'une catégorie Sinalite, ou la chaîne d'origine en repli. */
export function categoryLabelFor(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
