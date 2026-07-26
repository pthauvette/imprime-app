# Expérience client Plio — recherche multiagent (2026-07)

**Méthode** : 15 enquêteurs sur des lentilles disjointes du parcours client, chacun ancré dans le code
(`fichier:ligne` obligatoire), puis réfutation adversariale de **chaque** recommandation (147 agents,
0 échec — passe complétée intégralement après une reprise).
**Résultat** : 148 findings · 131 actionnables · **130 vérifiés retenus · 1 réfuté** · 17 points déjà bons.

> ⚠️ **Limites de l'étude, à connaître avant de s'en servir** (cf. §Fiabilité en fin de document) :
> toutes les vérifications ont tourné, mais le taux de rejet reste bas (≈1%) — une poignée de
> recommandations vérifiées « vraies » omettent quand même un compromis réel du code (exemple documenté
> plus bas). Et aucune observation d'utilisateur réel n'a eu lieu : tout est déduit du code.

---

## Diagnostic

Le cœur du produit (configurateur de prix live, préflight de fichier, panier→paiement, suivi post-achat
sans compte) est **solide et souvent meilleur que la concurrence** — un vrai actif, à ne pas casser en
corrigeant le reste. Mais le parcours est truffé de **promesses que le code ne tient pas** : prépresse
humaine inexistante, BAT jamais produit, délais de livraison qui ignorent systématiquement le temps de
production, code promo d'excuse qui n'existe pas, fenêtre d'annulation « 2h » fictive — c'est le risque le
plus sérieux de tous, parce que Plio n'a **zéro commande réelle** et va bâtir sa première réputation sur
ces écarts.

En parallèle, des trous de **plomberie oubliée** empêchent des flux déjà construits de servir (carnet
d'adresses jamais lu, fichiers perdus entre étapes, réachat qui ne réutilise pas le fichier, webhook qui
écrit les données de tracking dans un format que personne ne lit). Le français est **incomplet à
l'endroit le plus visible** : le configurateur — l'étape où le client engage son argent le plus lourdement
— bascule en anglais brut alors qu'un traducteur existe déjà côté IA (MCP) et pas côté humain. Enfin, deux
familles de dette transverse rongent la confiance en silence : le mobile (CSS legacy qui écrase les
collapses `@media`) et l'accessibilité (zéro `aria-live` sur le prix qui bouge, sur les erreurs de
paiement, sur le préflight fichier).

---

## 1. Avant d'arriver (SEO, accueil, catalogue)

**[1] 🔥 Rebrancher les 5 cartes de visite spécialité (Foil, Die Cut, pliées)** — impact fort, effort S
`/order/start` (start/page.tsx:287) route directement vers `/order/v/cartes-de-visite`, qui ne couvre que
20 des 25 productId de la catégorie Sinalite. Les 5 orphelins (Foil métallique, Die Cut, Folded) sont
vendus sur la homepage (page.tsx:182-188) et **injoignables**. Fix : router vers
`/order/product?category=<slug>` qui fait déjà le collapse virtuel+brut.

**[4] Supprimer le « 18pt soft touch »** (n'existe pas — seul le 16pt existe) — répété à 4 endroits
(page.tsx:169, order/product:236, samples:78 vs :28, pricing:55). Impact fort, effort S.

**[5] /compare : prix sans marge, en anglais, CTA cassé** — page indexée au sitemap qui affiche le tarif
Sinalite brut au lieu du prix client, un `/order/start?product=N` que rien ne lit, et des noms fournisseur
anglais. Impact fort, effort M.

**[6] Traduire les 63 produits « bruts » (hors catalogue virtuel)** — SKU/ID Sinalite affichés au client,
recherche FR inopérante. Impact fort, effort L.

**[7] Brancher les 6 prix vitrine de l'accueil sur `getStartingPrices`** (aujourd'hui codés en dur —
`git log -S` confirme qu'ils n'ont jamais bougé depuis le commit initial, contrairement au badge héros déjà
dynamisé). Impact moyen, effort M.

**[9] Indexer les 13 pages produit `/order/v/[slug]`** au sitemap avec vraie meta description (rien
aujourd'hui — seul `/compare`, anglais, est indexé). Impact moyen, effort S.

**[12] Retirer les 3 étiquettes en rouleau** dont la fiche produit crash systématiquement (schéma Sinalite
`group` requis absent → alerte Slack critique à chaque clic client). Impact fort, effort S.

**[13] Remplacer `guessCategorySlug` par la table `CATEGORY_GROUPS` déjà exacte** — le bouton
« Précédent »/fil d'Ariane renvoie 44% du catalogue vers « cartes de visite » par défaut. Impact fort,
effort S.

**[96] Paralléliser les 5 attentes série de `/order/start`** (catalogue, overrides, avis, session, drafts)
— première page du tunnel, tout en série. Impact moyen, effort S.

---

## 2. Choisir le produit (`/order/v/[slug]`, `/order/product`)

**[2] 🔥 Rendre visible sur mobile l'aperçu 3D de finition** — `.recap` (VirtualProductPicker.tsx:163) est
masqué sous 1100px sans l'exception déjà accordée à `.recap-payment`/`.recap-config`. 100% des téléphones
perdent le SEUL aperçu visuel de soft-touch/UV/foil, plus le récap du choix, plus la note prix. Impact
critique, effort S — une ligne de classe CSS + une entrée dans le sélecteur d'exception.

**[3] 🔥 Afficher « dès X $ » par papier et par finition** — 20 combinaisons sans un seul chiffre affiché ;
`getStartingPrices` existe et sert déjà ailleurs. Impact fort, effort M.

**[8] Proposer l'échantillon gratuit AU moment du choix du papier** — aucun lien vers `/samples` dans tout
le picker, et le catalogue d'échantillons ne couvre pas les vrais papiers vendus (pearl/synthetic/18pt
absents, foil proposé mais inexistant pour cartes de visite). Impact moyen, effort M.

**[16] Masquer les sections à choix unique et corriger le ratio des vignettes de format** —
151/164 produits ont des sections « 1 option disponible » inutiles ; les vignettes de format (coroplaste)
clampent largeur/hauteur indépendamment → formats très différents rendus identiques. Impact moyen,
effort S.

---

## 3. Configurer (`/order/configure`) — l'étape la plus dense en défauts

**[97] 🔥 Traduire les options et corriger « Papier » qui désigne en fait recto/verso** — le groupe
Sinalite `Stock` (choix recto vs recto-verso) est libellé « Papier » et affiche deux cartes visuellement
identiques (même description de grammage). Le traducteur existe déjà côté MCP (configure.ts:73-94) et
n'est jamais branché côté humain. Impact critique, effort M.

**[10] 🔥 Défaut = 2 faces (4/4), pas 1 face** — combiné à [97] : un client qui a déjà choisi son papier à
l'étape 2 n'a aucune raison de retoucher une section nommée « Papier », part avec le défaut 1-face, et
découvre au retour un dos blanc — tirage complet perdu. Impact critique, effort M.

**[98] Réparer « Round Corners » → affiche littéralement « YES »** — mauvaise clé de traduction
(`Rounded Corners` au lieu de `Round Corners`). Impact fort, effort S.

**[11] 🔥 Ne plus afficher le prix de la combinaison précédente pendant le calcul (repli distant)** — le
curseur de quantité change, le prix reste figé sur l'ancienne quantité (bug de clé de cache manquante),
jusqu'au paiement où le vrai sous-total apparaît. Impact fort, effort S.

**[15] Afficher le delta de prix sur chaque option** — l'index de variantes est déjà dans le navigateur
(O(1)), zéro appel réseau nécessaire pour le cas simple. Impact fort, effort M.

**[18] Choisir la quantité par défaut par valeur (≈500), pas par position** — deux finitions du même
produit affichent un prix d'ancrage 6× différent (75u vs 750u) sans raison visible. Impact moyen, effort S.

**[70]-[72] Overflow mobile du header/footer sticky du wizard** — encoche iPhone non gérée (`.shell-header`
sans `env(safe-area-inset-top)`), et le footer à deux boutons reproduit l'overflow déjà corrigé sur
`/order/shipping`. Impact fort, effort S/M.

**[81] Rendre le prix live audible** (`aria-live` absent malgré la promesse « prix en temps réel »).
Impact fort, effort S.

**[80] États « sélectionné » invisibles pour lecteur d'écran** (format/papier/livraison — classe CSS
seule). Impact fort, effort S (aria-pressed minimal).

**[86] Aperçu 3D : couper l'animation si `prefers-reduced-motion`**, canvas sans nom accessible. Impact
moyen, effort M.

**[89], [90] Mettre en cache `getProduct()` et l'index de variantes (DB, pas seulement mémoire Lambda)** —
seul point du catalogue sans repli en cas de panne Sinalite ; `error.tsx` pur alors que le reste du site
dégrade proprement. Impact fort, effort S/M.

---

## 4. Téléverser le fichier (`/order/upload`)

**[19] 🔥 Afficher la taille exacte attendue (trim + bleed, po et mm) sur la dropzone** — le client doit
deviner, puis se fait rejeter, et découvre la bonne taille SEULEMENT dans le message d'erreur. Toutes les
données existent déjà (`expectedDims`, `marginSpec`) — **vérifié directement dans le code** : `expectedDims`
n'apparaît nulle part dans le JSX, seulement dans la logique de validation. Impact critique, effort S.

**[20] 🔥 Ne plus afficher « ✓ Validé » identique pour un PDF parfait, un fichier accepté avec réserve, et
un .AI/.PSD jamais vérifié** — trois niveaux de confiance réels réduits à un seul badge vert, qui ne dépend
que de `isUploaded` — **vérifié** : le badge s'affiche dès que le fichier est uploadé, indépendamment du
résultat de validation. Impact critique, effort M.

**[21] Dessiner l'overlay bleed/trim/safe à partir du VRAI fichier, pas de la taille typique de la
famille** — dans le cas le plus fréquent (fichier pile au format, sans bleed), l'overlay ment visuellement
alors que le texte avertit correctement. Impact fort, effort M.

**[100] 🔥 Reformuler le blocage dur en français actionnable + 3 sorties (gabarit, éditeur, contact)** —
aujourd'hui « TrimBox 3.60"×2.10" ≠ attendu 3.50"×2.00" » sans aucun lien. Impact critique, effort M.

**[22]/[116]/[130] Fournir un gabarit téléchargeable** (trait de coupe + bleed + zone sûre) — toutes les
cotes existent en code (`margin-specs.ts`), pdf-lib est déjà une dépendance serveur, zéro gabarit n'existe
nulle part dans le dépôt. Impact fort, effort M.

**[23] Rendre le verso obligatoire si recto-verso choisi** — aujourd'hui `required={false}` codé en dur,
quelle que soit la config payée. Impact fort, effort M.

**[24] Arrêter d'avertir « seules les 2 premières pages seront imprimées » pour les livrets/brochures** —
`maxPages=2` en dur s'applique même aux produits multipages vendus. Impact fort, effort M.

**[27] Ne pas perdre les fichiers au retour vers `/configure`** — le paramètre `files` est porté vers
l'avant (upload→shipping) mais pas vers l'arrière (upload↔configure), pattern déjà corrigé ailleurs dans
le même wizard. Impact moyen, effort S.

**[73] État « analyse en cours » manquant** (3 lectures complètes du PDF en RAM, écran figé, double-
soumission possible). Impact fort, effort L.

**[74] Porte de sortie « finir sur mon ordinateur »** (lien envoyé par courriel, l'URL contient déjà tout
l'état). Impact fort, effort M.

**[79] Annoncer le résultat du préflight** (erreurs ET avertissements silencieux pour lecteur d'écran).
Impact fort, effort M.

**[93], [94] État « Analyse du fichier… » manquant + worker pdfjs en 1st-party** (CDN tiers, casse dès CSP
enforce). Impact fort/moyen, effort S.

**[77] Réafficher le bloc de réassurance (S3/90j/prépresse) sur mobile** — mêmes trous CSS `.recap` que
[2]. Impact moyen, effort S.

---

## 5. Livraison (`/order/shipping`)

**[17]/[28]/[38]/[41]/[107]/[114]/[122] 🔥 UNIFIER : l'ETA affichée PARTOUT ne compte que le transport,
jamais la production** — même bug répété sur 7 surfaces : `/order/shipping` (estimate/route.ts:41 —
**vérifié**, `eta: addBusinessDays(today, days)` où `days` vient uniquement du tuple transporteur
Sinalite), `/orders/[id]` (`computeOrderEta`, timeline.ts:154-171, forfait 7j/3j calendaires), le courriel
« en route » (send.ts:285, +2 jours calendaires en dur), le calendrier .ics, MCP `get_order_status`. C'est
**la promesse la plus vérifiable du produit et elle est fausse par construction pour 100% des commandes**.
Impact critique, effort L — créer UN helper `computeDeliveryDate(productionDays, transitDays)` consommé par
les 7 surfaces au lieu de 3 calculs indépendants.

**[29] Montrer sous-total + taxes estimées dès l'étape livraison** — récap sans un seul montant avant
l'écran de paiement, ET ce bloc est invisible sur mobile (`.recap` nu). Impact fort, effort M.

**[32]/[48] 🔥 Bouton « Réessayer » quand le calcul des méthodes de livraison échoue** — cul-de-sac total
aujourd'hui. Impact fort, effort S.

**[33] Ne plus désactiver l'autofill sur le champ Adresse** (`autoComplete="off"` en dur). Impact faible,
effort S.

**[34]/[53]/[126] 🔥 Brancher le carnet d'adresses au checkout** — **vérifié directement** : aucun `GET`
n'est exporté par `/api/addresses/route.ts` (seul `POST`), et le formulaire ne lit QUE le `localStorage`,
effacé après chaque commande. Un client fidèle retape 8 champs à chaque fois. Impact fort, effort M.

**[36] Ajouter un champ Entreprise** (B2B majoritaire, colis retournés sans nom d'entreprise sur bureaux).
Impact moyen, effort M (repli sans migration possible : préfixer `ShipAddr2`).

**[82] Nommer province et code postal pour lecteur d'écran** (champs sans `htmlFor`/`aria-label`) + lier le
message d'erreur. Impact fort, effort S.

**[83] Annoncer chargement/résultat des méthodes de livraison** (`aria-live` absent). Impact fort, effort S.

**[76] Élargir la carte de paiement sur mobile** (marges/padding inline 128px perdus sur 375px de large).
Impact moyen, effort S.

---

## 6. Payer (`/order/review`)

**[26]/[31]/[115] 🔥 Relire les vraies options (papier, finition, recto/verso, délai) + une vignette du
fichier avant de payer** — aujourd'hui « 6 options · 1 fichier(s) » ; le serveur calcule déjà
`buildItemsSnapshot` mais ne le renvoie jamais dans la réponse de `/api/orders/create`. Sur du 200$+ non
annulable, impossible de vérifier qu'on n'a pas payé pour la mauvaise finition. Impact fort, effort M.

**[35] Le code promo efface la carte déjà saisie** — `<Elements key={clientSecret}>` remonte tout le
formulaire Stripe sans avertissement quand on teste un code, ET crée un nouveau PaymentIntent par
tentative. Impact moyen, effort S.

**[78] 🔥 Annoncer l'erreur de paiement Stripe (`role="alert"` absent)** — le seul point du parcours qui
touche à l'argent réel et le seul sans annonce pour lecteur d'écran, alors que le pattern existe 160 lignes
plus haut dans le même fichier. Impact fort, effort S.

**[87] Stripe Elements figé en clair sur thème sombre** — rectangle blanc éclatant sur fond sombre à
l'étape la plus sensible. Impact moyen, effort S.

**[92] Squelette du total pendant la création du PaymentIntent** — écran vide sauf un texte gris 14px
pendant l'attente la plus anxiogène du parcours. Impact fort, effort M.

**[91] Supprimer le double appel `/api/products/[id]` au montage** (requête DB dupliquée, sans conséquence
perçue mais du gaspillage). Impact faible, effort S.

---

## 7. Après l'achat (confirmation, statuts, suivi, courriels)

**[62]/[25] 🔥🔥 ARRÊTER DE PROMETTRE UNE PRÉPRESSE HUMAINE ET UN BAT** — c'est LA rassurance numéro un
pour un client qui a peur de gaspiller 200$, répétée à 5+ endroits (**vérifié aux 3 emplacements cités** :
accueil `page.tsx:223`, upload `upload/page.tsx:285`, confirmation `confirmation/page.tsx:100` — texte
exact confirmé) — et **totalement fausse** : le webhook Stripe soumet directement à Sinalite
(stripe-process.ts:453), aucun statut d'attente, aucun champ BAT en base. Les CGU adossent une garantie de
conformité à un artefact qui n'existe jamais. Décision produit à trancher : soit construire le BAT réel,
soit reformuler partout en honnête. **C'est le point le plus grave du plan** — risque juridique ET
promesse la plus citée par les autres bugs. Impact critique, effort M.

**[30]/[63]/[43] 🔥 Retirer « Production démarre sous 2h / annulation gratuite »** — **vérifié aux 2
emplacements cités** (review/page.tsx:624 et :804) — 7 occurrences sur 6 fichiers au total, 3 formulations
différentes du délai, toutes contredites par la politique de remboursement réelle (annulation manuelle
1-2h ouvrables, frais min. 25$/article). Impact fort, effort S (pur changement de texte).

**[37] 🔥 Corriger le format du payload webhook Sinalite (imbriqué vs plat)** — le webhook écrit
`{payload:{...}}`, tous les lecteurs (`timeline.ts`, `event-describe.ts`) attendent le format plat.
Résultat : **le numéro de suivi n'apparaît JAMAIS dans le portail client**, même une fois la commande
expédiée, alors que le courriel l'a bien reçu. Impact critique, effort S — une ligne + rendre les lecteurs
tolérants aux deux formats pour les commandes déjà en base.

**[39] Réconcilier les statuts par cron si le webhook Sinalite n'arrive jamais** — aucun filet ; un webhook
rejeté (>5 min de délai) échappe même au replay admin. Impact fort, effort M.

**[40] 🔥 Afficher la vraie commande sur `/order/confirmation`** (aujourd'hui : `PaymentIntent pi_3Rk…`,
aucun article, aucun lien vers la commande) — le CTA doit pointer vers `/track` pour un invité, pas vers
`/orders/[id]` qui redirige vers sign-in. Impact fort, effort M.

**[41] Le courriel « en route » promet 2 jours calendaires fixes**, contredit la date du portail. Impact
fort, effort S.

**[42] Le courriel de livraison ne dit rien du recours (10j/24h) et vend au lieu de rassurer** — vignette
produit codée en dur même pour une affiche. Impact fort, effort M.

**[109] 🔥 Le code promo « DÉSOLÉ20 » du courriel d'annulation n'existe nulle part** — le client le plus
fragile du parcours reçoit une deuxième déception garantie s'il retente sa chance. Impact fort, effort M.

**[50] Traduire l'erreur technique brute (« Sinalite POST order/new → 500 ») en message client** — révèle
le nom du fournisseur alors que le reste du site l'anonymise soigneusement. Impact fort, effort S.

**[44] Rafraîchir le widget « En production » au lieu de dire au client « Refresh la page »** — les deux
helpers nécessaires existent déjà, juste pas branchés. Impact moyen, effort S.

**[45] Bouton « Signaler un problème » sur commande livrée** — réutiliser `/contact?subject=...` déjà
préremplissable. **Nuance vérifiée** : la politique de remboursement promet un flux `mailto:` direct avec
photo par pièce jointe courriel (pas un formulaire web) — un des deux enquêteurs sur ce point a été
réfuté pour avoir confondu les deux canaux ; le vrai gap restant est plus étroit (mailto sans `subject`/
`body` pré-remplis). Impact fort, effort S (paramètres d'URL, pas un système d'upload).

**[105]/[106] Un CTA d'avis cassé (double `?`) coexiste avec un CTA fonctionnel + relance J+7 qui ignore
un avis déjà laissé** — malgré son propre texte « on ne re-demande pas ». Impact fort/moyen, effort S.

**[51] Dimension figée « 3,5×2" » dans le courriel de livraison** — fausse pour tout produit hors cartes
de visite. Impact moyen, effort S.

**[47] Casser la boucle de redirection `/payment/retry`** — le paramètre `cancelled=1` n'est jamais lu.
Impact fort, effort S.

**[49] Accusé de réception + OrderEvent sur demande d'annulation/contact** — aucune trace pour le client.
Impact fort, effort M.

**[112] Alerter quand un courriel transactionnel est bloqué par la liste de suppression**. Impact moyen,
effort M.

**[111] Router le lien magique via la file d'envoi et retirer le « Se désabonner » circulaire** (mène à
une page qui exige d'être connecté). Impact moyen, effort S.

**[110] Envoyer un courriel court au passage IN_PRODUCTION** — 2-3 jours de silence total. Impact fort,
effort M.

**[113] Version texte des courriels tronquée à 1000 caractères sans les liens.** Impact moyen, effort M.

---

## 8. Revenir (compte, réachat, fidélité)

**[54]/[119] 🔥 Réutiliser les fichiers de la commande d'origine dans « Recommander »** — le paramètre
`?files=` existe et fonctionne déjà entre upload↔shipping (**vérifié** : threadé upload→shipping→review),
juste pas branché sur le deep-link de réachat (`reorder.ts`). Impact fort, effort M.
>
> ⚠️ **Nuance non relevée par le crible adversarial** (trouvée en spot-check manuel après la première
> passe) : `src/lib/orders/reorder.ts:5-9` documente EXPLICITEMENT que le non-ré-upload est voulu — « les
> fichiers peuvent avoir expiré côté S3 + c'est un bon contrôle qualité que l'user revérifie ». Or
> `upload/page.tsx:284` confirme une purge S3 à 90 jours. Réutiliser aveuglément casserait un reorder au-
> delà de 90 jours (lien mort). Le correctif reste valide, mais doit vérifier la fraîcheur du fichier
> (ex. comparer `order.createdAt` à 90j) avant de préremplir `?files=`, sinon on remplace un vieux problème
> par un nouveau (lien de fichier cassé silencieusement).

**[57] Passer `/account` aux classes responsive** — seule page du compte en styles inline figés. Impact
fort, effort S.

**[55] Aligner les avantages fidélité affichés avec ce qui est appliqué** — la remise Argent 5% n'existe
nulle part dans le code de prix ; la gratuité Or est plafonnée à 25$ mais annoncée « peu importe le
montant ». Risque LPC (représentation trompeuse). Impact fort, effort S.

**[56] Deux composants de la même page `/account` affichent deux paliers de fidélité différents** (colonne
DB mensuelle vs calcul en direct). Impact moyen, effort S.

**[58]/[117] Sauvegarder automatiquement l'éditeur de design ou dire la vérité dans `/drafts`** — la page
promet une sauvegarde continue qui n'existe pas ; tout est perdu au refresh. Impact moyen, effort S
(corriger le texte) à M (vrai autosave).

**[60] Bouton « Recommander » directement sur chaque ligne de `/orders`**, pas enfoui en 7e position.
Impact moyen, effort S.

**[59] Remplacer l'identifiant Stripe par le numéro de commande sur la confirmation**, lien vers `/track`
pour les invités (voir aussi [40]).

**[52] Rendre le support atteignable depuis l'espace client** — le bouton d'aide flottant n'existe que
dans `/order/*`, absent de `/orders`, `/account`.

**[127] La raison sociale saisie à l'inscription est jetée** (`companyName` explicitement ignoré) —
facture et étiquette d'expédition au nom de la personne. Impact fort, effort M.

**[128] Champ « Référence / bon de commande » côté web** — l'API MCP l'expose déjà. Impact moyen, effort S.

---

## 9. Support, devis, éditeur

**[129] Fermer la boucle du devis sur mesure** — le lien de paiement promis n'existe pas côté admin, et le
courriel de devis renvoie vers le formulaire vierge. C'est le parcours du plus gros compte. Impact fort,
effort L.

**[46] Aligner `help-faq.ts` sur la réalité** (validateur, délais d'annulation, transporteur Postes Canada
absent du checkout réel). Impact fort, effort S.

**[101] Trois autres promesses fausses du centre d'aide** (validation couleur/polices, annulation,
transporteur). Impact fort, effort S.

---

## 10. Contenu, langue, confiance

**[125]/[97] 🔥 Traduire les valeurs d'options dans le configurateur** — voir §3, c'est le trou de français
le plus visible du site.

**[121]/[124] Le sélecteur FR/EN est désactivé (couverture ~18%) et les 15 gabarits d'e-mails sont FR
seulement** — quick-win immédiat : retirer les 3 mentions publiques de bilinguisme qui contredisent le
switch désactivé, en attendant un vrai chantier de traduction. Impact moyen, effort S (mentions) / XL
(traduction complète).

**[61] Retirer le témoignage client fictif** (« Maxime Roy — Agence Boréal ») de `/sign-in` — zéro commande
réelle à ce jour. Impact moyen, effort S.

**[66] Retirer les faux signaux de popularité** (« Bestseller », « nos clients reviennent » — zéro
commande) sur `/samples`, et la fausse statistique « 0,3% des cas » sur la politique de remboursement.
Impact fort, effort S.

**[67] Retirer « audits de sécurité externes annuels »** de la politique de confidentialité — faux,
document opposable Loi 25. Impact fort, effort S.

**[65] Le « tirage d'épreuve physique à 18$ » promis en FAQ couleur n'existe nulle part au catalogue.**
Impact fort, effort L (vrai SKU) ou S (reformuler vers `/samples`).

**[68] Deux notes moyennes différentes sur la même page d'accueil** (calcul plein vs sous-ensemble de 5
avis affichés). Impact moyen, effort S — dormant tant qu'il n'y a pas d'avis réels.

**[102]/[103] Nettoyer fautes, franglais et jargon interne visibles** + retirer SKU/ID Sinalite des écrans
clients. Impact moyen, effort S.

**[69] Aligner le discours de l'écran d'upload sur le vrai modèle de sécurité S3** (public-read + clé
imprévisible, pas « cadenas »). Impact moyen, effort S.

---

## 11. Transverse — mobile, performance, accessibilité, CSS

**Overflow mobile** (pattern déjà documenté dans CLAUDE.md — « l'overflow ne se lit pas, il se mesure ») :
[2], [57], [70]-[72], [76], [77] — tous liés au même mécanisme (`.recap` display:none sans exception, ou
CSS legacy qui écrase un collapse `@media`). À traiter en une seule passe avec `/overflow-scan` à 375px
après chaque fix.

**Accessibilité** (aucun de ces trous n'a été touché par l'audit mobile 2026-06) : [78]-[85] — `aria-live`
absent sur : erreur de paiement, préflight fichier, prix live, méthodes de livraison ; champs sans nom
accessible ; états sélectionnés invisibles ; canvas 3D sans alternative. ~10 patchs S, impact fort sur un
segment de clientèle totalement exclu aujourd'hui.

**Performance** : [88] aucun `loading.tsx` sur tout le tunnel de commande. [95] CSS admin/marketing legacy
chargé sur toutes les pages y compris le paiement — **une piste de découpage par segment de route a été
réfutée avec preuve chiffrée** (voir §Fiabilité) : le bundle réellement servi est minifié (30 Ko gzip, pas
51 Ko), immuable et mis en cache dès la 1ère page, donc payé une seule fois par session, pas à chaque
étape critique.

---

## À NE PAS CASSER

- Le collapse papier × finition de `/order/v/[slug]` et `/order/product` — la meilleure décision produit
  du parcours.
- Le prix live du configurateur (index local O(1), zéro réseau) — instantané par construction.
- Le moteur de validation de fichier (`/order/upload`) — gradation erreur/avertissement + garde
  anti-faux-blocage, meilleur que la plupart des concurrents.
- Le paiement sans compte, total recalculé serveur, Apple/Google Pay.
- `/track` (numéro + courriel, sans connexion) — exactement le bon design pour un invité.
- Le remboursement automatique en cas d'échec de mise en production Sinalite (webhook Stripe).
- Le suivi de commande et la restitution des options au réachat sur `/orders/[id]`.
- La chaîne d'authenticité des avis (état vide honnête + jeton HMAC post-livraison) — ne pas la polluer
  avec les faux signaux listés en §10.
- Les modals, le combobox d'adresse, les anneaux de focus — déjà au niveau attendu.
- La continuité invité → compte au paiement.

---

## Quick wins — impact fort/critique, effort S

1. **[2]** Classe `recap-preview` pour l'aperçu 3D mobile — une ligne CSS.
2. **[19]** Afficher la taille exacte attendue sur la dropzone — donnée déjà calculée.
3. **[37]** Format plat du webhook Sinalite — une ligne, débloque tout le suivi post-achat.
4. **[1]** Rebrancher les 5 cartes spécialité vers `/order/product`.
5. **[4]** Corriger 18pt→16pt soft touch aux 4 endroits.
6. **[12]** Masquer les 3 produits en rouleau qui crashent.
7. **[13]** Table de correspondance catégorie déjà écrite, juste à brancher au bouton « Précédent ».
8. **[11]** Attacher une clé de combo au prix distant — 2 lignes.
9. **[98]** Corriger la clé de traduction « Round Corners ».
10. **[30]/[63]** Retirer les 7 mentions « production sous 2h/annulation gratuite ».
11. **[47]** Lire le paramètre `cancelled` sur `/payment/retry`.
12. **[50]** Ne plus exposer le message d'erreur Sinalite brut au client.
13. **[78]** `role="alert"` sur l'erreur Stripe — copier-coller du pattern 160 lignes plus haut.
14. **[32]/[48]** Bouton « Réessayer » sur l'échec de calcul de livraison.
15. **[57]** `<main className="acct-main">` sur `/account`.
16. **[61]/[66]/[67]** Retirer témoignage fictif, faux badges, fausse mention d'audit.
17. **[27]** Porter `files` sur le lien « Précédent » d'upload — pattern déjà écrit deux fois ailleurs.
18. **[44]** Brancher `computeOrderEta`/`extractTracking` (déjà existants) sur le widget compte.

---

## Plan d'exécution

### Vague 1 — Arrêter de mentir, arrêter de casser (1-2 semaines)

Priorité absolue : ce qui expose Plio à un vrai litige sur la première commande réelle, et ce qui casse
des flux déjà construits pour un coût de correction dérisoire.

- **[62]/[25]** Trancher (avec Patrick) : construire le BAT ou reformuler partout — décision produit, pas
  juste du code.
- **[30]/[63]/[43]** Retirer les 7 mentions « 2h/annulation gratuite ».
- **[37]** Format plat du webhook — débloque le suivi post-achat pour de vrai.
- **[109]** Corriger ou retirer le code promo d'excuse fantôme.
- **[97]/[10]** Traduire le groupe Stock et corriger le défaut recto/verso.
- Tous les **quick wins** listés ci-dessus.
- **[2]** Aperçu 3D mobile (critique, une ligne).

### Vague 2 — Combler les trous de plomberie déjà à moitié construits (2-4 semaines)

- **[17]/[28]/[38]/[41]/[107]/[114]/[122]** Unifier l'ETA (production + transit) sur les 7 surfaces.
- **[34]/[53]/[126]** Brancher le carnet d'adresses.
- **[54]/[119]** Réutiliser les fichiers au réachat — **avec la garde de fraîcheur 90j** (cf. nuance §8).
- **[26]/[31]/[115]** Vraies options + vignette à l'écran de paiement.
- **[3]/[15]** Prix par option/papier dans le picker et le configurateur.
- **[19]/[20]/[21]/[100]** Passe complète sur la crédibilité du préflight upload.
- **[39]** Cron de réconciliation des statuts Sinalite.
- **[40]/[59]** Refaire `/order/confirmation`.
- **[105]/[106]/[110]/[42]/[51]** Nettoyage de la séquence de courriels post-achat.

### Vague 3 — Accessibilité, mobile, i18n, contenu (continu, en parallèle)

- **[78]-[85]** Sweep accessibilité.
- **[70]-[77]** Sweep overflow mobile via `/overflow-scan`.
- **[88]/[89]/[90]/[96]** Sweep performance (loading.tsx, cache Sinalite).
- **[97]/[121]/[124]/[125]** Traduction (configurateur d'abord).
- **[46]/[101]/[65]/[102]/[103]/[69]** Nettoyage de contenu et alignement légal/FAQ.
- **[129]** Fermer la boucle du devis sur mesure.
- **[6]** Traduction des 63 produits de longue traîne.

### Dépendances externes

- **Sinalite est en SANDBOX** — tout ce qui touche au statut réel de production ne peut être vérifié en
  conditions réelles qu'après le passage en prod ; le mapping « Turnaround → jours ouvrables » nécessaire
  pour l'ETA unifiée doit être calibré avec les vrais délais Sinalite, pas deviné.
- **SES/`bonjour@plio.ca`** — si cette boîte n'est réellement pas surveillée, c'est un choix opérationnel à
  confirmer avant de router davantage de trafic client vers elle.
- **Console AWS/Supabase** — rétention/purge des fichiers non vérifiables depuis le code seul.
- **`GOLD_FREE_SHIPPING_CAP_CENTS` / réglages fidélité** — vérifier ce qui est réellement positionné en
  prod avant de corriger le texte des avantages.

---

## Fiabilité de cette étude

**Mise à jour** : la passe adversariale a été reprise et complétée intégralement (147/147 agents, 0 échec).
Voici l'état réel, pas celui d'avant :

1. **✅ Fermé — 33 vérifications manquantes récupérées.** Les 131 findings actionnables ont désormais
   tous un verdict (`retenu`/`rejeté`), contre 99/131 dans la première passe. Aucun finding restant sans
   crible adversarial.

2. **Nuancé — le taux de rejet reste bas (2 rejets sur 230 verdicts, ≈0,9%), mais ce n'est pas de la
   complaisance : c'est vérifié dans les deux sens.**
   - Les 2 rejets retrouvés dans le journal sont **rigoureux et chiffrés**, pas des réflexes de politesse :
     l'un mesure le vrai poids gzip du bundle CSS servi (30 Ko réels vs 51 Ko cités par l'enquêteur, calcul
     `git log -S` et `gzip -c` à l'appui) pour démonter un finding perf ; l'autre distingue précisément le
     flux `mailto:` (promis par la politique de remboursement) du formulaire web `/contact` pour rejeter un
     finding qui confondait les deux canaux de réclamation.
   - **Mais un spot-check manuel indépendant (8 citations vérifiées à la main avant même la reprise du
     workflow) a trouvé une faille que le crible automatique n'a PAS attrapée** : le finding [54]/[119]
     (réutiliser les fichiers au réachat) est vérifié « vrai » — le mécanisme `?files=` existe bel et
     bien — mais aucun des vérificateurs n'a relevé que `reorder.ts` documente EXPLICITEMENT le choix
     inverse à cause de la purge S3 à 90 jours. Le crible sait détecter une citation `fichier:ligne`
     fausse ; il est moins bon pour détecter qu'une recommandation, tout en étant factuellement exacte,
     ignore un compromis déjà écrit ailleurs dans le code. **Conclusion pratique : vérifier chaque
     `fichier:ligne` avant d'agir reste nécessaire, surtout pour les items effort M ou plus — le taux de
     rejet bas reflète que les enquêteurs ancrés dans le code se trompent rarement sur les FAITS, pas
     qu'il faille sauter la relecture des CONSÉQUENCES.**

3. **Inchangé — aucune observation d'utilisateur réel.** Tout reste déduit du code. Le premier vrai client
   en apprendra plus que cette étude sur certains points, en particulier sur l'ordre de priorité perçu
   (impact/effort ici est un jugement de code, pas un jugement d'usage mesuré).

Ce qui est **solide** : les écarts promesse/code sont factuels et vérifiables ligne à ligne — la quasi-
totalité des citations spot-checkées manuellement (7/8) tenaient exactement, y compris le numéro de ligne.
C'est la partie de l'étude sur laquelle s'appuyer en premier, avec la garde ajoutée en §8 pour [54]/[119].
