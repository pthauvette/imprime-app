# Audit client Plio — Roadmap de développement

_Audit multiagent (19 agents, 91 findings vérifiés adversarialement) — 2026-06-01._

## Résumé exécutif

Plio est un SaaS d'impression Next.js déjà mûr sur ses fondations critiques : le tunnel de paiement recompute le subtotal server-side avec anti-tampering, l'auth magic-link est protégée contre l'open-redirect sur le flux signIn lui-même, le filtrage des commandes par session.user.id + mode view-as admin audité est en place, et le consentement CASL/Loi 25 côté newsletter est correct. C'est une base saine. Mais l'audit révèle trois faiblesses systémiques graves. (1) Sécurité : un IDOR ouvert sert le PDF print-ready de n'importe quel client sans auth (/api/designs/[id]/pdf), un open-redirect SSR subsiste sur /sign-in pour utilisateur connecté, et l'audit-trail noie la promotion de rôle ADMIN dans un kind fourre-tout. (2) Promesses UI mensongères : compteurs sidebar codés en dur (12 commandes pour un nouvel user), lien "+ Nouvelle commande" en 404, brouillon "Continuer" qui repart de zéro, "Supprimer mon compte" désactivé alors que la feature existe, filtres /orders décoratifs, accordéon FAQ légal figé masquant 7 réponses sur 8, compteur produits affiché ×100. (3) Incohérences de contenu et dette : délais de livraison contradictoires (1-7 vs 4-5 vs 4-7 j), SLA support 2h vs 4h, branding "IMPRIME" résiduel sur la confirmation post-paiement, switch FR/EN qui ne traduit que la home, CSS dupliqué à ~654 sélecteurs, et aucun focus-trap sur les modals. Le risque dominant n'est pas l'architecture mais la confiance : trop d'affordances cliquables ne font rien, et plusieurs faux signaux (métriques inventées, numéro 555, chat inexistant) érodent la crédibilité d'un produit qui vend de la fiabilité d'impression B2B.

## Top risques

1. IDOR critique : /api/designs/[id]/pdf sert l'artwork print-ready de tout client sans auth ni ownership — l'id cuid transite en clair dans l'URL navigateur (Referer, logs). Fuite de données client exploitable par simple possession d'un id.
2. Open-redirect SSR sur /sign-in (callbackUrl non validé pour utilisateur déjà connecté) — vecteur de phishing avec un lien d'apparence plio.ca redirigeant hors-site.
3. Audit-trail non fiable : la promotion d'un user au rôle ADMIN (élévation de privilège) et le replay de webhook financier sont loggés sous le kind fourre-tout ADMIN_TEMPLATE_EDIT, indistinguables dans /admin/audit. Compromet la traçabilité de sécurité.
4. returnUrl Stripe retombe silencieusement sur http://localhost:3000 si NEXT_PUBLIC_APP_URL manque au build — conséquence catastrophique (paiement réussi, client perdu, cart non vidé, aucune confirmation) sans échec bruyant.
5. Promesses UI cassées en série qui détruisent la confiance : compteurs sidebar hardcodés, lien '+ Nouvelle commande' en 404, brouillon 'Continuer' qui repart de zéro malgré la promesse explicite, 'Supprimer mon compte' désactivé alors que la feature fonctionne ailleurs, filtres /orders et accordéon FAQ légal purement décoratifs.
6. shippingPrice client non re-validé server-side (contrairement au subtotal) — vecteur de sous/sur-facturation porté côté backend, plus bulk SHIPPED appliquant le même tracking à N commandes distinctes (mauvais numéro envoyé à chaque client).

## Répartition des findings par zone

| Zone | Findings |
|---|---|
| marketing | 13 |
| funnel | 14 |
| account | 11 |
| auth | 10 |
| admin | 13 |
| misc (drafts, legal, status, help/search, reviews, newsletter, onboarding) | 10 |
| security | 3 |
| a11y | 9 |
| consistency | 8 |

## Roadmap

### Round 1 — Sécurité & intégrité financière

_Failles exploitables de fuite de données et de redirection, plus risques d'argent (returnUrl localhost, shipping non revalidé, refunds sans borne) et traçabilité de sécurité. Aucune dépendance produit ne devrait passer avant ces correctifs. Tous sont des fixes ciblés à faible surface._

- 🔴 **Fermer l'IDOR sur /api/designs/[id]/pdf (auth + ownership)**  `[critical/S]`
  - Pourquoi : Le handler GET stream le PDF print-ready sans auth() ni vérification d'ownership ; l'id cuid transite en clair dans l'URL côté client (upload/page.tsx:54). Calquer sur invoice.pdf/receipt.pdf : auth(), draft.userId === session.user.id || role ADMIN, 404 silencieux sinon.
  - Où : `src/app/api/designs/[id]/pdf/route.ts:15-40`
- 🟠 **Valider callbackUrl avant redirect SSR sur /sign-in (open redirect)**  `[high/S]`
  - Pourquoi : callbackUrl brut passé à redirect() pour un user déjà connecté → redirection hors-site (phishing). Extraire sanitizeCallbackUrl() (startsWith('/') && !startsWith('//') && pas de scheme) réutilisable, fallback /orders.
  - Où : `src/app/sign-in/page.tsx:22-23`
- 🟠 **Dériver returnUrl Stripe de window.location.origin (ou échouer bruyamment)**  `[high/S]`
  - Pourquoi : returnUrl retombe sur http://localhost:3000 si NEXT_PUBLIC_APP_URL absent au build → paiement réussi mais client perdu, cart non vidé, aucune confirmation. Le composant est 'use client' : utiliser window.location.origin, toujours correct. Vérifier la var dans la config build Amplify.
  - Où : `src/app/order/review/page.tsx:505 ; src/lib/env.ts:67`
- 🟡 **Re-valider shippingPrice server-side dans /api/orders/create**  `[medium/M]`
  - Pourquoi : Contrairement au subtotal (recompute + rejet >0,05$), shippingPrice client est passé tel quel à applyShippingPerks et entre dans le total Stripe sans recompute depuis méthode+adresse. Vecteur de sous/sur-facturation. Recalculer/valider server-side comme le subtotal.
  - Où : `src/app/api/orders/create/route.ts:76,243-247,263`
- 🟠 **Types d'audit dédiés pour les actions sensibles admin (fin du fourre-tout ADMIN_TEMPLATE_EDIT)**  `[high/M]`
  - Pourquoi : La promotion de rôle ADMIN, le replay webhook financier, la décision reseller et la modération review loggent toutes kind='ADMIN_TEMPLATE_EDIT' → indistinguables dans /admin/audit. Ajouter ADMIN_USER_ROLE_CHANGE, ADMIN_WEBHOOK_REPLAY, ADMIN_RESELLER_DECISION, ADMIN_REVIEW_MODERATE et les câbler.
  - Où : `src/lib/db/admin-audit.ts:16-34 ; users/bulk:132 ; webhooks/[id]/replay:122 ; reviews/[id]:78 ; reseller-applications/[id]:66`

### Round 2 — Liens morts & promesses UI cassées (compte)

_Une grappe de bugs bloquants/trompeurs concentrés dans la zone compte qui apparaissent sur TOUTES les pages connectées : fausses données permanentes, liens 404, features désactivées qui existent pourtant. Impact direct sur la confiance et la conversion vers une nouvelle commande. Fixes majoritairement S/M._

- 🟠 **Sidebar : retirer/wirer les compteurs de badges hardcodés**  `[high/M]`
  - Pourquoi : SECTIONS contient des count littéraux (commandes:12, brouillons:3, adresses:4) affichés à tous les users, y compris un nouveau compte vide. Passer les vrais comptes Prisma par userId depuis un Server Component, ou retirer les count.
  - Où : `src/components/account/Sidebar.tsx:15-18`
- 🟠 **Corriger le lien sidebar '+ Nouvelle commande' (404)**  `[high/S]`
  - Pourquoi : href='/order/new' n'existe pas (route Next absente) → 404 sur toutes les pages compte. Remplacer par '/order/start', cohérent avec /orders et le dashboard.
  - Où : `src/components/account/Sidebar.tsx:29`
- 🟠 **Réactiver 'Supprimer mon compte' (feature existante) sur /settings**  `[high/S]`
  - Pourquoi : Bouton disabled title='à wirer' alors que DeleteAccountRequest fonctionne sous /settings/privacy (POST /api/account/delete-request opérationnel). L'user conclut à tort que la suppression est impossible. Lien vers /settings/privacy + maj du commentaire d'en-tête obsolète.
  - Où : `src/app/settings/page.tsx:183-199`
- 🟠 **Restaurer le brouillon à 'Continuer' (repart actuellement de zéro)**  `[high/M]`
  - Pourquoi : /drafts promet 'reprends exactement où tu en étais' mais /design/[slug] ne charge aucun draft (sampleValues seulement) et recrée un draft. Pointer vers ?draftId=X, ajouter props draftId/initialValues à DesignEditor, faire pointer addToCart/finalize sur le draft existant.
  - Où : `src/app/drafts/page.tsx:75 ; src/app/design/[slug]/page.tsx:30-33 ; src/components/design/DesignEditor.tsx:45`
- 🟡 **Rendre les filtres de statut /orders fonctionnels (ou non-cliquables)**  `[medium/M]`
  - Pourquoi : Pills stylées cliquables (cursor:pointer, 'Tous' figé active) mais aucun onClick/href ; /orders ne lit aucun searchParams.status. Convertir en <Link>?status= + filtrer la query Prisma, sinon retirer le styling interactif.
  - Où : `src/app/orders/page.tsx:201-235,316-330`

### Round 3 — Intégrité du tunnel de commande

_Bugs du chemin de conversion principal qui dégradent fiabilité et confiance au moment du paiement : perte d'options, faux récap, PDF template non vérifié, branding résiduel, cul-de-sac de confirmation. Chaque item touche directement le taux de complétion de commande._

- 🟠 **Propager les options à l'étape Précédent depuis Quantité**  `[high/S]`
  - Pourquoi : prevHref n'inclut pas &options= → retour sur sélection par défaut, perte format/papier/finition. configure/page.tsx ré-hydrate déjà via prefilledOptionIds ; baseOptionIds est dispo dans le composant. Fix trivial.
  - Où : `src/components/wizard/QuantityClient.tsx:110`
- 🟡 **Corriger le branding 'IMPRIME' sur la page de confirmation**  `[medium/S]`
  - Pourquoi : Footer post-paiement affiche 'HELLO@IMPRIME.CO · © IMPRIME 2026' alors que le reste de la page est rebrandé Plio. Moment de réassurance clé. Remplacer par 'bonjour@plio.ca · © Plio 2026'.
  - Où : `src/app/order/confirmation/page.tsx:109`
- 🟡 **Vérifier le PDF template avant de marquer le recto 'Validé'**  `[medium/M]`
  - Pourquoi : Avec ?designId, un UploadedFile est créé sans HEAD/GET de vérif ; canContinue passe true immédiatement alors que /api/designs/[id]/pdf peut renvoyer 404/500. L'user paie avec un recto cassé, détecté seulement en prépresse. Ajouter vérif + état chargement/erreur.
  - Où : `src/app/order/upload/page.tsx:50-60`
- 🟡 **Rediriger le cul-de-sac de confirmation sans payment_intent vers /order/start**  `[medium/S]`
  - Pourquoi : Sans payment_intent (refresh, bookmark), ErrorState renvoie vers /order/review qui affiche immédiatement 'Données manquantes'. Pointer le CTA vers /order/start.
  - Où : `src/app/order/confirmation/page.tsx:30-32,116-122,229`
- ⚪ **Récap multi-item : enrichir le snapshot cart (nom + prix réels)**  `[low/M]`
  - Pourquoi : handleAddAnother snapshot 'Produit #ID · 0 $' (productName factice, unitPriceCents:0) → récap peu rassurant sur l'écran de paiement. Le vrai nom/prix est déjà fetché en configure/quantity ; l'inclure dans le snapshot.
  - Où : `src/app/order/review/page.tsx:150-159,312-319`

### Round 4 — Bugs admin opérationnels

_Défauts qui touchent les opérations internes : envoi de mauvais tracking aux clients, double overlay, absence d'error boundary sur des pages data-heavy, refunds non bornés, navigation cassée sur tablette. Risque opérationnel et de support client réel._

- 🟡 **Empêcher le tracking commun erroné sur bulk SHIPPED**  `[medium/M]`
  - Pourquoi : createMany applique le MÊME trackingNumber à toutes les commandes sélectionnées → chaque client reçoit un tracking qui n'est pas le sien dans l'email + /track. Interdire le tracking quand >1 order, ou n'autoriser que pour un envoi groupé réel explicitement coché.
  - Où : `src/app/api/admin/orders/bulk/route.ts:110-131 ; OrderBulkBar.tsx:184-201,304-310`
- 🟠 **Approuver une demande reseller doit débloquer le statut user + notifier**  `[high/M]`
  - Pourquoi : Le handler 'approve' ne set que status='APPROVED' sans toucher User.resellerStatus ni envoyer d'email → pricing reseller non débloqué, client non notifié. Set resellerStatus dans la même transaction + email de décision.
  - Où : `src/app/api/admin/reseller-applications/[id]/route.ts:39-43 ; ResellerActions.tsx:91-92`
- 🟡 **Ajouter error.tsx et loading.tsx à /admin**  `[medium/M]`
  - Pourquoi : Aucun error/loading boundary sur des pages force-dynamic à lourdes requêtes Prisma → écran d'erreur Next générique sans retry, pas de skeleton. Ajouter boundary (retry + lien dashboard) et skeleton.
  - Où : `src/app/admin/ (aucun error.tsx/loading.tsx)`
- 🟡 **Borner le cumul des refunds partiels + exposer le montant restant**  `[medium/M]`
  - Pourquoi : Le garde-fou ne vérifie qu'un seul appel (>amountCents) ; deux refunds partiels peuvent dépasser le total (Stripe rejette en 502 brut). Dériver le déjà-remboursé, valider <= restant côté serveur, l'afficher dans OrderActions.
  - Où : `src/app/api/admin/orders/[id]/refund/route.ts:49-55 ; OrderActions.tsx:39,82`
- 🟡 **Rétablir la navigation admin sous 1024px + dédoublonner CommandPalette**  `[medium/M]`
  - Pourquoi : .adm-nav est display:none sous 1024px sans hamburger/drawer ; seul Cmd+K (sans trigger tappable) reste → admin mobile/tablette ne peut plus naviguer. De plus CommandPalette est monté en double (layout + AdminSidebar) → deux overlays empilés. Ajouter un drawer + retirer le 2e montage (AdminSidebar:208).
  - Où : `globals.css:10243-10245 ; AdminSidebar.tsx:208 ; admin/layout.tsx:23`

### Round 5 — Cohérence du contenu marketing (claims & nav)

_Incohérences de contenu visibles publiquement qui nuisent à la crédibilité d'un produit B2B vendant de la fiabilité : délais contradictoires, SLA divergents, fausses promesses de canaux (chat, 555), nav d'aide piégée. Plusieurs se recoupent (délais ↔ footers dupliqués) et se règlent au mieux via constantes partagées._

- 🟠 **Unifier la fenêtre de délai de livraison via une constante partagée**  `[high/S]`
  - Pourquoi : Trois fenêtres contradictoires (1-7 vs 4-5 vs 4-7 j), parfois sur la même page. Source aggravée par les footers dupliqués (home/about inline). Définir une constante unique et l'appliquer partout (home corps+FAQ+footer, about stat+meta+footer, pricing).
  - Où : `src/app/page.tsx:129,218,236,273 ; about/page.tsx:16,97,233 ; pricing/page.tsx:131`
- 🟠 **Corriger les liens 'Aide'/'Centre d'aide' qui pointent vers /contact au lieu de /help**  `[high/S]`
  - Pourquoi : Sur /contact (:18,:90) et /legal/refund-policy (:17,:171), les libellés Aide/Centre d'aide renvoient vers /contact alors que /help existe et est la cible utilisée ailleurs (pricing, about). L'user cherchant de l'aide reste piégé sur le formulaire.
  - Où : `src/app/contact/page.tsx:18,90 ; src/app/legal/refund-policy/page.tsx:17,171`
- 🟡 **Harmoniser le SLA support (2h vs 4h) et fiabiliser les signaux de preuve**  `[medium/S]`
  - Pourquoi : SLA affiché 4h sur contact/ContactForm vs 2h sur help (×3)/about. À unifier via constante. Profiter pour retirer/honorer les faux signaux : métrique '1h47 aujourd'hui' codée en dur (contact:30) et claim 'Chat en direct dans l'app' sans widget (contact:44).
  - Où : `contact/page.tsx:29,30,44 ; ContactForm.tsx:84 ; help/page.tsx:23,71,93 ; about/page.tsx:202`
- 🟡 **Retirer le numéro de téléphone fictif (555) du CTA ventes B2B**  `[medium/S]`
  - Pourquoi : tel:+15145550144 (préfixe 555 réservé/placeholder) cliquable sur la carte 'Ventes & partenariats' → prospect B2B tombe dans le vide sur le canal le plus précieux. Mettre un vrai numéro ou retirer le lien (garder sales@plio.ca).
  - Où : `src/app/contact/page.tsx:52`
- 🟡 **Aligner le modèle rush/express entre home et pricing**  `[medium/S]`
  - Pourquoi : FAQ home : surcharge $ fixe (+12$/+28$), paliers 4-5/2-3/1j ; pricing : surcharge % (~15-30%), paliers 4-7j/24-48h. Deux modèles de prix et deux jeux de délais pour le même service. Aligner paliers et logique de surcharge.
  - Où : `src/app/page.tsx:236 ; src/app/pricing/page.tsx:131`

### Round 6 — Auth & pages publiques — feedback et exactitude

_Le flux d'entrée magic-link a des trous de feedback (erreur silencieuse sur lien expiré = cas d'échec le plus fréquent) et plusieurs pages publiques affichent des accordéons/recherches cassés ou de la doc légale inexacte. Impact conversion (entrée) et conformité (Loi 25)._

- 🟠 **Afficher l'erreur sur lien magique expiré/déjà utilisé**  `[high/S]`
  - Pourquoi : authConfig n'a pas de pages.error et SignInPage ne lit jamais searchParams.error → Auth.js renvoie ?error=Verification mais l'user retombe sur un formulaire vierge muet (cas d'échec le plus fréquent du magic-link). Lire error et afficher une bannière (mapper Verification/Configuration/AccessDenied).
  - Où : `src/auth.config.ts:17 ; src/app/sign-in/page.tsx:16-23`
- 🟠 **Débloquer l'accordéon FAQ figé de /legal/refund-policy (7/8 réponses cachées)**  `[high/S]`
  - Pourquoi : Server Component sans JS : seul le 1er .faq-item a la classe 'open', les 7 autres ont leur réponse en display:none, alors que le '+'/cursor:pointer suggèrent une interaction. Convertir en <details>/<summary> natifs (zéro JS) comme HelpSearch.
  - Où : `src/app/legal/refund-policy/page.tsx:122-162 ; migrated-pages.css:5647-5654`
- 🟡 **Réparer les deep-links search → FAQ (ancres /help#slug inexistantes)**  `[medium/S]`
  - Pourquoi : /api/search génère href:/help#slug mais les <details> de HelpSearch n'ont aucun id → le parcours search→réponse amène en haut de /help sans scroller ni ouvrir. Ajouter id={slugify} partagé + ouvrir le <details> ciblé via le hash.
  - Où : `src/app/api/search/route.ts:67 ; src/app/help/HelpSearch.tsx:149-150`
- 🟡 **Corriger le nom de cookie de consentement dans la politique de confidentialité (Loi 25)**  `[medium/S]`
  - Pourquoi : L'Article 04 cite 'plio_cookie_consent' alors que l'implémentation pose 'plio_consent', et affirme un refus de cookies analytiques alors qu'aucun analytics n'est posé (simple acknowledgement). Documentation légale inexacte vs runtime. Aligner nom + reformuler.
  - Où : `src/app/legal/privacy/page.tsx:194,196 ; src/lib/legal/cookie-consent.ts:16`
- 🟡 **Fiabiliser 'Renvoyer un lien' (perte de l'email) et l'état d'erreur de /search**  `[medium/M]`
  - Pourquoi : Deux frictions de feedback : sent/page.tsx renvoie vers /sign-in nu (perte de l'email, libellé trompeur 'Renvoyer') — propager ?email + prop initialEmail ; et SearchClient.catch fait setResults([]) sans flag erreur → page muette sur échec API. Ajouter un état d'erreur distinct de '0 résultat'.
  - Où : `src/app/sign-in/sent/page.tsx:119,132 ; src/app/search/SearchClient.tsx:35-46`

### Round 7 — Accessibilité — modals & champs

_Lacune a11y systémique : aucun modal n'a de focus-trap (focus s'échappe derrière l'overlay), plusieurs champs centraux n'ont pas de nom accessible, et des bannières d'erreur ne sont pas annoncées. Un hook partagé useFocusTrap résout la majorité d'un coup. Important pour conformité et qualité, mais sous les bugs fonctionnels._

- 🟠 **Hook partagé useFocusTrap pour tous les modals**  `[high/M]`
  - Pourquoi : OnboardingTour, CommandPalette, FloatingHelpButton (role=dialog aria-modal) et UserMenu n'ont aucun focus-trap ni focus restore → au clavier le focus sort vers la page sous l'overlay. Hook useFocusTrap(ref, open) : focus initial, bouclage Tab, restore sur le déclencheur (btnRef existe dans UserMenu). Couvre aussi EmailComposerModal admin.
  - Où : `OnboardingTour.tsx ; CommandPalette.tsx ; FloatingHelpButton.tsx ; UserMenu.tsx ; UserBulkBar.tsx:263-340`
- 🟡 **OnboardingTour : Escape + focus initial**  `[medium/S]`
  - Pourquoi : Modal affiché auto à la 1ère visite, fermable seulement à la souris, sans focus posé au mount. Ajouter keydown Escape → close et focus le bouton 'Fermer le tour' à l'ouverture.
  - Où : `src/components/onboarding/OnboardingTour.tsx:67-98`
- 🟡 **Noms accessibles sur les champs de recherche et newsletter**  `[medium/S]`
  - Pourquoi : L'input /search (champ central) et l'input email NewsletterSignup (footer, présent sur la plupart des pages publiques) n'ont qu'un placeholder, pas de nom accessible. Ajouter aria-label (ou label sr-only). Aligner sur ProductListClient déjà correct.
  - Où : `src/app/search/SearchClient.tsx:54-71 ; src/components/marketing/NewsletterSignup.tsx:63-71`
- 🟡 **CommandPalette : compléter le pattern combobox (aria-activedescendant)**  `[medium/M]`
  - Pourquoi : Navigation ↑↓ surligne visuellement mais l'input n'a ni role=combobox/aria-expanded/aria-controls/aria-activedescendant, ni les divs role=option/listbox → la sélection clavier est invisible au lecteur d'écran. Ajouter les rôles et activedescendant.
  - Où : `src/components/admin/CommandPalette.tsx:153-233`
- ⚪ **Validation contact + role=alert + ARIA combobox sur AddressAutocomplete (funnel shipping)**  `[low/M]`
  - Pourquoi : Sur shipping : contactValid trop laxe (email='@' suffit), Field sans aria-invalid/message ; AddressAutocomplete input sans role=combobox/aria-expanded/activedescendant et impossible à rouvrir au clavier après Escape. Ajouter aussi role=alert au bloc d'erreur SignInForm (SignUpForm l'a déjà). Renforcer validation + ARIA.
  - Où : `shipping/page.tsx:95,199-205,435-446 ; AddressAutocomplete.tsx:130-168 ; SignInForm.tsx:67-81`

### Round 8 — i18n — honnêteté du switch FR/EN

_Le LangSwitch est exposé app-wide mais ne traduit que le nav/hero de la home : tout le reste (footer, funnel, compte, admin, pages publiques) reste en FR dur. C'est une fausse promesse de bilinguisme sur un marché B2B canadien. Décision produit d'abord (masquer vs investir), puis extraction priorisée par trafic. Effort L, donc après les bugs._

- 🟠 **Décider : masquer LangSwitch derrière un flag OU lancer l'extraction i18n**  `[high/L]`
  - Pourquoi : Seuls 4 fichiers touchent l'i18n ; basculer en EN ne traduit que le nav/hero de la home et laisse footer/funnel/compte/admin/legal en FR. Soit cacher le switch tant que la couverture est insuffisante, soit décider d'investir. Le dictionnaire contient déjà des clés mortes (footer.*, lang.*).
  - Où : `src/lib/i18n/messages.ts:21-71 ; src/components/account/UserMenu.tsx:164`
- 🟡 **Câbler MarketingFooter sur l'i18n (clés footer.* déjà définies mais inutilisées)**  `[medium/M]`
  - Pourquoi : Le footer rendu sur toutes les pages marketing/legal est en FR dur alors que footer.tagline/footer.copyright existent. Incohérence la plus visible du switch. Premier candidat à l'extraction.
  - Où : `src/components/marketing/MarketingFooter.tsx:11-55 ; messages.ts:38-39`
- 🟡 **Exposer un sélecteur de langue sur les pages marketing + extraction du funnel**  `[medium/L]`
  - Pourquoi : Aucune page marketing sous la home n'expose de switch ni ne passe par translate() → choix EN perdu dès /pricing. Si EN est un objectif : exposer LangSwitch dans la nav marketing partagée puis prioriser l'extraction du funnel /order/* (chemin de conversion) et des pages publiques à fort trafic (track, legal, search).
  - Où : `page.tsx:43 ; about/pricing/contact/help/samples/quote/compare ; src/app/order/* ; src/components/wizard/*`
- ⚪ **Nettoyer les clés i18n mortes et localiser LangSwitch**  `[low/S]`
  - Pourquoi : lang.fr/lang.en/lang.switchTo/footer.* sont définies mais jamais référencées ; LangSwitch hardcode aria-label='Language' et rend 'fr'/'en' bruts low-contrast. Utiliser ces clés ou les retirer pour éviter le faux signal de couverture.
  - Où : `src/lib/i18n/messages.ts:38-44,64-70 ; src/components/i18n/LangSwitch.tsx:29,58`

### Round 9 — Polish, dette CSS & cohérence design

_Items de finition à faible risque, regroupés en fin de roadmap : compteur produit ×100, dette CSS dupliquée, confirmations natives incohérentes, commentaires obsolètes/alarmants. Aucun n'est bloquant mais leur cumul pèse sur la perception de qualité et la maintenabilité. La zone funnel back-end (anti-tampering subtotal, recovery, persistance ship) est par ailleurs saine — peu à corriger ici._

- 🟠 **Corriger le compteur produits affiché ×100 sur /order/start**  `[high/S]`
  - Pourquoi : totalProducts est passé à formatCurrency (style:'currency', 2 décimales) puis le regex garde les '00' des cents → '250 produits' devient '25000 produits' sur la 1re page de conversion. Utiliser toLocaleString('fr-CA') ou un formateur d'entier.
  - Où : `src/app/order/start/page.tsx:173`
- ⚪ **Migrer les confirmations destructives vers useConfirmDialog**  `[low/M]`
  - Pourquoi : window.confirm natif (mobile-hostile, non stylé) utilisé dans 14 fichiers admin (broadcast, promotion ADMIN bulk, tax-exempt, replay webhooks) + addresses/favorites, alors que useConfirmDialog existe. Prioriser broadcast et promotion ADMIN. Retirer aussi le confirm sur 'Faire défaut' (réversible).
  - Où : `14 fichiers admin ; AddressActionsBar.tsx:40 ; FavoriteActions.tsx:110`
- 🟡 **Dédupliquer migrated-pages.css vs globals.css (~654 sélecteurs)**  `[medium/L]`
  - Pourquoi : ~654 sélecteurs de base communs aux deux feuilles importées globalement → ~6k lignes redondantes shippées partout, cascade fragile (modif à deux endroits), conflits réels (.mkt-nav-links gap 28 vs 32px). Ne garder dans migrated-pages.css que les overrides @media. Tokeniser .mkt-nav-links.
  - Où : `src/styles/migrated-pages.css ; src/styles/globals.css ; layout.tsx:3,10`
- ⚪ **Nettoyer les vestiges UI/commentaires trompeurs (account/admin)**  `[low/M]`
  - Pourquoi : Grappe de faux signaux à faible coût : bouton 'Modifier' profil disabled sans alternative (settings:65-77), accès historique wallet gated sur walletCents>0 (wallet:201), lien sidebar 'Réglages' → /admin/crons, stat admin 'TODO: wirer DesignDraft↔Order' (value='—') visible en prod, commentaire /orders faussement 'liste TOUTES les commandes'. Retirer/corriger.
  - Où : `settings/page.tsx:65-77 ; wallet/page.tsx:201 ; AdminSidebar.tsx:196 ; admin/templates/[slug]/edit/page.tsx:470 ; orders/page.tsx:8-10`
- ⚪ **Masquer ShippingEditButton en impersonation + PaymentIntent sur clé de contenu**  `[low/S]`
  - Pourquoi : Deux correctifs ciblés : ShippingEditButton/CancelRequestButton rendus pour un admin en view-as alors que l'API renvoie 404 (isImpersonating dispo l.86, les masquer) ; et le PaymentIntent dépend de allItems.length au lieu d'une clé de contenu stable (mutation à length égale non détectée). Dépendre d'un hash productId+optionIds+files.
  - Où : `orders/[id]/page.tsx:543-555 ; api/orders/[id]/shipping:78-81 ; review/page.tsx:249`
