# Expérience client Plio — recherche multiagent (2026-07)

**Méthode** : 15 enquêteurs sur des lentilles disjointes du parcours client, chacun ancré dans le code
(`fichier:ligne` obligatoire), puis réfutation adversariale de chaque recommandation.
**Résultat** : 148 findings · 131 actionnables · 98 vérifiés retenus · 17 points déjà bons.

> ⚠️ **Limites de l'étude, à connaître avant de s'en servir** (cf. §Fiabilité en fin de document) :
> 33 vérifications n'ont pas pu tourner, et le taux de rejet (1/99) est trop bas pour une passe
> réellement adversariale. Les recommandations ci-dessous sont **des pistes solidement documentées**,
> pas des vérités validées une à une.

---

## Diagnostic

L'infrastructure de l'expérience client est **bonne** : préflight de fichier meilleur que la plupart des
concurrents, suivi public sans compte, paiement sans compte, remboursement automatique si l'imprimeur
échoue, avis authentifiés par jeton, collapse papier × finition. Ce sont de vrais actifs.

Le problème n'est pas ce que le site **fait** — c'est l'écart entre ce qu'il **dit** et ce qu'il fait.

Le thème le plus lourd de toute la recherche, et de loin, est **38 promesses écrites que le code ne tient
pas** (dont 8 critiques). Pour une boutique qui n'a pas encore vendu, c'est l'enjeu numéro un : chaque
promesse fausse devient une plainte au premier client, un remboursement, un avis négatif — au moment
précis où la réputation se construit et où il n'y a aucun historique pour amortir.

Deuxième foyer : **la date de livraison affichée est structurellement fausse** (elle ne compte que le
transport, jamais la production). Troisième : **le moment du fichier**, où l'information dont le client a
besoin est déjà calculée mais jamais montrée.

---

## Foyer 1 — Les promesses que le code ne tient pas 🔥

**38 findings, 8 critiques.** C'est le foyer le plus grave et le moins cher à corriger : il s'agit surtout
de **retirer ou reformuler du texte**, pas de bâtir des fonctionnalités.

### 1.1 « Notre prépresse vérifie ton fichier » — il n'y a pas de prépresse 🔥

La phrase qui rassure le designer inquiet est répétée à **quatre endroits**, et elle est fausse : dès que
Stripe confirme, la commande part chez Sinalite en quelques secondes, sans qu'aucun humain n'ouvre le
fichier, et sans bon à tirer.

- `src/app/page.tsx:223` — « Notre équipe vérifie ton fichier (bleed, dimensions, résolution) avant la presse »
- `src/app/order/upload/page.tsx:285` — « Notre prépresse les revoit avant impression »
- `src/app/order/confirmation/page.tsx:100` — « dès que notre prépresse a validé tes fichiers »
- Les CGU invoquent un BAT qui n'existe nulle part dans le code

**Deux sorties possibles**, à trancher :
- **(a) Dire la vérité** — « vérification automatique du fond perdu, des dimensions et de la résolution ».
  Effort S. C'est honnête, et la vérification automatique est déjà un argument fort.
- **(b) Créer la revue humaine** — un statut « en revue » avant soumission à Sinalite. Effort L, mais
  c'est un vrai différenciateur si tu veux le vendre.

Ne pas choisir = promettre (a) en faisant (b).

### 1.2 « Annulation gratuite, production sous 2 h » — la commande part dans la seconde 🔥

La **dernière ligne** lue avant « Confirmer la commande » suggère une fenêtre de rétractation de 2 heures.
En réalité, la soumission est immédiate et l'annulation coûte **25 $ par article**.

- `src/app/order/review/page.tsx:624` et `:804`
- Contredit aussi la politique de remboursement, qui dit « quelques minutes »

C'est le genre d'écart qui produit une plainte formelle, pas juste un client déçu.

### 1.3 Autres promesses à corriger (toutes effort S)

| Promesse | Réalité |
|---|---|
| « 18pt soft touch » (4 endroits) | N'existe pas au catalogue |
| « Tirage d'épreuve physique à 18 $ » | Nulle part dans le code |
| « Audits de sécurité externes annuels par cabinet indépendant » | Inventé (politique de confidentialité) |
| Signaux de popularité sur /samples | Fabriqués |
| Code promo d'excuse « DÉSOLÉ20 » | N'existe pas — envoyé aux clients dont la commande est annulée |
| Prix « à partir de » de la landing | Codés en dur, alors que `ProductStartingPrice` existe |
| `src/data/help-faq.ts` | Désaligné avec la politique de remboursement et le validateur réel |
| « Seules les 2 premières pages seront imprimées » | Dit aux clients qui commandent un **livret** |

---

## Foyer 2 — La date de livraison est fausse 🔥

**18 findings.** Trois enquêteurs indépendants ont convergé sur le même défaut.

`src/app/api/shipping/estimate/route.ts:41` — `eta: addBusinessDays(today, days)` où `days` vient du tuple
Sinalite `[carrier, method, price, days]` : c'est le **transit transporteur seul**. Le temps d'impression
(1 à 5 jours ouvrables selon le `Turnaround` que le client vient pourtant de choisir et de payer à l'étape 03)
n'est jamais ajouté.

**Le client lit « jeudi 5 février · 2 jours ouvrables », comprend « mes cartes arrivent jeudi », et reçoit
son colis 3 à 5 jours plus tard.** C'est la première cause de plainte en impression en ligne.

**Correctif** : composer l'ETA = production (déjà connue, groupe `Turnaround`) + transit, et l'afficher
comme deux segments distincts. Effort M. À faire **avant** le premier client.

Corollaires du même foyer :
- Le courriel « en route » annonce une livraison à **+2 jours calendaires en dur**, quel que soit le service.
- Aucun état « en production » : 2 à 5 jours de silence total entre la confirmation et l'expédition.

---

## Foyer 3 — Le moment du fichier

**32 findings, 5 critiques.** C'est le moment de peur maximale : « est-ce que mes 200 $ vont sortir corrects ? »

### 3.1 La taille exigée est calculée… et jamais affichée 🔥 (effort S)

`src/app/order/upload/page.tsx:147-150` résout `expectedDims` — la taille exacte attendue, fond perdu
compris. Elle est passée aux dropzones… et utilisée uniquement pour **rejeter** le fichier.

Le client doit **deviner** qu'il faut exporter à 3,75 × 2,25 po. Il exporte à 3,5 × 2, se fait rejeter,
et ne comprend pas pourquoi. **Afficher la valeur qu'on possède déjà** est le meilleur rapport
impact/effort de toute l'étude.

### 3.2 « ✓ Validé » est affiché quand rien n'a été validé 🔥

Trois situations très différentes produisent le **même badge vert** :
1. un PDF parfait ;
2. un PDF sans fond perdu, où le client a cliqué « Continuer quand même » ;
3. un `.AI` / `.EPS` / `.PSD` / `.TIFF` — sur lequel **zéro contrôle** ne tourne (`upload/page.tsx:371-407`,
   la validation n'existe que pour PDF et raster).

Le badge ment au moment où le client cherche à se rassurer.

### 3.3 Les autres (effort M)

- **Messages en jargon** : « TrimBox 3.60" × 2.10" ≠ attendu » — blocage dur, sans issue ni traduction.
- **Overlay de fond perdu** dessiné à partir de la taille « typique », pas des vraies boîtes du PDF téléversé.
- **Verso non obligatoire** en impression recto-verso → le client paie 4/4 et n'envoie qu'un recto.
- **Aucune sortie** si le client n'a pas de fichier : ni gabarit téléchargeable, ni lien clair vers l'éditeur.
- **L'éditeur de design ne sauvegarde pas** : un rafraîchissement efface 20 minutes de travail.

---

## Foyer 4 — Le catalogue amputé et le vocabulaire

### 4.1 Cinq produits vendus mais injoignables 🔥 (effort S)

`src/app/order/start/page.tsx:287` — les familles à slug virtuel court-circuitent la page produit. Résultat :
les **cartes Foil métallique, Die Cut et pliées** sont annoncées sur la landing (« à partir de 128,00 $ »)
et dans la tuile de catégorie (« 25 produits »)… mais aucun chemin ne permet de les atteindre.

### 4.2 L'aperçu 3D est caché sur mobile (effort S)

`src/components/wizard/VirtualProductPicker.tsx:163` — le seul élément qui montre à quoi ressemble
vraiment un soft touch, un spot UV ou un foil est en `display:none` sous 1100px. Donc invisible sur
**100 % des téléphones**, exactement là où le client décide.

### 4.3 « Stock » n'est pas le papier 🔥 (effort M)

Le choix **le plus lourd de conséquences** de toute la commande — imprimer 1 face ou 2 — est présenté
comme un choix de *papier*, sous le libellé « Papier », avec deux cartes portant la **même description**,
et le défaut est **1 face**.

`ConfigureClient.tsx:598` mappe le groupe Sinalite `Stock` → « Papier ».

Un client qui a conçu un recto-verso paie une impression recto. Renommer en « Impression recto /
recto-verso », décrire les deux options distinctement, et mettre 4/4 par défaut.

### 4.4 Le configurateur est en anglais (effort M)

Après avoir choisi en français « Carte de visite · 16pt · Soft touch », le client arrive sur un écran
d'options en anglais brut. **Le dictionnaire de traduction existe déjà côté MCP** — le web n'en a aucun.

---

## Foyer 5 — Après le paiement

- **Le numéro de suivi n'apparaît jamais dans le portail** 🔥 (effort S). `src/lib/db/orders.ts:451-462`
  écrit l'événement webhook **imbriqué** (`{payload: …}`) alors que les lecteurs attendent la forme à plat.
  Le client reçoit son suivi par courriel, va sur sa commande, et lit « le tracking apparaîtra ici ».
- **Aucune réconciliation** : si le webhook Sinalite est manqué, la commande reste figée indéfiniment.
  Un cron qui interroge Sinalite fermerait le trou (effort M).
- **Aucun recours en cas de problème** (effort L) : sur une commande livrée, le client n'a qu'un
  `mailto:` en 12 px. Pas de bouton « Signaler un problème », pas de photo, pas de suivi de réclamation.
  Or c'est *le* moment qui décide s'il recommande.

---

## Foyer 6 — Le réachat (là où vit un imprimeur)

- **Le carnet d'adresses est un cul-de-sac** 🔥 (effort M) : on peut créer des adresses dans `/addresses`,
  mais le checkout ne les lit jamais (`shipping/page.tsx:76-87` ne lit que `localStorage`). Il n'existe
  même pas de `GET /api/addresses`. Un client fidèle retape 8 champs à chaque commande.
- **« Recommander » ne réutilise pas les fichiers** 🔥 (effort M) : le paramètre `?files=` existe déjà,
  `reorder.ts:65` ne le passe pas. Le client doit retrouver et re-téléverser le PDF de sa commande d'il y a 3 mois.
- **Le panier ne survit pas à un abandon** : la table `Draft` existe, rien ne l'écrit.
- **La raison sociale saisie à l'inscription est jetée** : aucune entreprise sur la facture ni sur l'étiquette.

---

## À NE PAS CASSER

17 points relevés comme **déjà excellents**. À préserver dans toute refonte :

- **Le préflight de fichier** — « meilleur que celui de la plupart des concurrents », et le principal
  argument de vente. La gradation erreur-bloquante / avertissement-avec-consentement est juste.
- **La chaîne d'authenticité des avis** — état vide honnête + jeton HMAC post-livraison. Le meilleur actif
  de confiance du site.
- **Le suivi public `/track`** — numéro + courriel, sans connexion. Exactement le bon design.
- **Le paiement sans compte**, total recalculé serveur, Apple/Google Pay, claviers mobiles adaptés.
- **Le remboursement automatique** si l'imprimeur échoue, et l'annulation qui n'annonce que le montant
  réellement remboursé.
- **Le collapse papier × finition** — « la meilleure décision produit », le modèle à répliquer ailleurs.
- **Le prix live du configurateur** — instantané par construction (index local O(1), zéro réseau).
- **La continuité invité → compte** — une commande sans compte est rattachée au bon utilisateur.
- **Les modals, le combobox d'adresse et les anneaux de focus** — déjà au niveau attendu en accessibilité.

---

## Quick wins — impact fort/critique, effort S

À faire en premier : maximum d'effet, risque minimal.

1. **Afficher la taille de fichier exigée** sur la dropzone (elle est déjà calculée).
2. **Rebrancher les 5 cartes spécialité** (Foil, Die Cut, pliées) — produits vendus mais injoignables.
3. **Afficher l'aperçu 3D sur mobile** (retirer le `display:none` sous 1100px).
4. **Corriger le payload du webhook** — le numéro de suivi apparaîtra enfin dans le portail.
5. **Retirer « Production démarre sous 2h »** et la promesse d'annulation gratuite.
6. **Supprimer les promesses inventées** : audits de sécurité, 18pt soft touch, épreuve à 18 $, faux
   signaux de popularité, code DÉSOLÉ20.
7. **Brancher les prix de la landing** sur `ProductStartingPrice`.
8. **`role="alert"` sur l'erreur de paiement Stripe** et `aria-live` sur le prix live.
9. **Casser la boucle de redirection** de `/payment/retry`.
10. **Relire les options en toutes lettres** sur l'écran de paiement (le snapshot lisible existe déjà).
11. **Corriger « Round Corners » / « YES »** dans le configurateur.
12. **Ne plus afficher le prix de la combinaison précédente** pendant le calcul du repli distant.

---

## Plan d'exécution

### Vague 1 — Avant le premier client (surtout du texte)

**Logique** : ne jamais laisser un client découvrir un écart entre la promesse et la réalité. C'est
irréversible sur la réputation, et c'est le moins cher à corriger.

1. Tout le **Foyer 1** (promesses) — trancher d'abord (a) ou (b) sur la prépresse.
2. L'**ETA production + transit** (Foyer 2) — le client doit savoir quand il reçoit.
3. Les **quick wins 1 à 7**.

### Vague 2 — Le parcours de commande

4. Le **moment du fichier** : taille affichée, messages en français, gabarit téléchargeable, verso
   obligatoire, badge « ✓ Validé » honnête.
5. Le **vocabulaire** : traduire les options (le dictionnaire MCP existe), renommer « Stock », lexique inline.
6. **Squelettes de chargement** (`loading.tsx`) sur le tunnel et le compte.

### Vague 3 — Le réachat et le service

7. **Carnet d'adresses** branché sur le checkout + fichiers réutilisés au réachat.
8. **Réclamations** : bouton « Signaler un problème » avec photo, sur commande livrée.
9. **Cron de réconciliation** des statuts Sinalite.
10. Courriel **« en production »** pour combler le silence.

### Dépendances externes

- L'ETA réelle et les statuts de production ne seront **vérifiables qu'une fois Sinalite en live**
  (aujourd'hui en sandbox). Les corriger maintenant reste juste — mais la validation attendra la bascule.
- Les courriels dépendent de la **sortie du sandbox SES**.

---

## Fiabilité de cette étude

Trois réserves, à connaître avant d'agir :

1. **33 vérifications n'ont pas tourné** (plafond de dépense atteint). Leurs findings sont inclus mais
   **non passés au crible adversarial** — traiter avec un cran de prudence supplémentaire.
2. **Le taux de rejet est de 1 sur 99.** C'est trop bas pour une passe réellement adversariale : soit les
   findings étaient excellents, soit les vérificateurs ont été complaisants. La vérité est probablement
   entre les deux. **Chaque recommandation cite `fichier:ligne` — vérifier avant d'agir**, surtout pour
   les items à effort M ou plus.
3. **Aucune observation d'utilisateur réel.** Tout est déduit du code. Le premier vrai client en
   apprendra plus que cette étude sur certains points.

Ce qui est en revanche **solide** : les écarts promesse/code sont factuels et vérifiables ligne à ligne —
c'est la partie de l'étude sur laquelle s'appuyer en premier.
