# Alignement Plio ↔ Sinalite — liste exhaustive de modifications (2026-07)

> **Provenance** : workflow multiagent `align-plio-sinalite` (50 agents, 8 dimensions, vérif adversariale — 41 écarts confirmés / 0 rejeté / 9 mineurs). Sources Sinalite rendues et faisant foi : **Terms of Service** (en_us / en_ca / fr_ca), *Our Promise*, *Preparing Your Files*, *free-shipping-faq*.
>
> **⚠️ Limites** : les pages « marketing » `our-guarantees` et `faq-custom` n'ont pas pu être fetchées (JS) → les formulations couleur/délai/réimpression basées dessus sont marquées DOUTEUX (§7) et doivent être revérifiées manuellement. La dimension « délais de production » a échoué au fetch mais est couverte par E7. **Divergence ToS en_us ↔ fr_ca** (fr_ca plus restrictif) : confirmer quelle version régit le contrat Plio↔Sinalite (D4) — les reco supposent la plus restrictive.

---

## 1. Verdict global

**Plio est SAIN côté technique money-path.** Le désalignement est commercial/éditorial : **Plio promet à son client final des choses systématiquement plus généreuses que ce que Sinalite lui accorde en amont.** Ce n'est ni illégal ni cassé — c'est une posture « client d'abord » — mais elle crée :
1. une **exposition de marge non provisionnée** (Plio absorbe l'écart à chaque incident) ;
2. des **inexactitudes factuelles** (specs/tolérances/délais chiffrés que le fournisseur ne garantit pas) → risque **LPC-Québec / Loi sur la concurrence** (publicité trompeuse).

**Décision transverse requise (Patrick)** : pour chaque risque **financier**, trancher entre
**(A) ASSUMER** — garder le geste comme différenciateur, mais le **budgéter** et documenter en interne qu'il n'est **pas** refacturable à Sinalite ; ou
**(B) ALIGNER** — corriger texte/code sur ce que Sinalite honore.
Les inexactitudes **factuelles** (E-série), elles, sont à corriger dans **tous** les cas (risque légal + quasi gratuit).

---

## 2. 🔴 Risques financiers — Plio promet plus que Sinalite honore

### F1 — Refund cash 100 % vs Sinalite fr_ca « Aucun remboursement ou crédit » (réimpression seule)
- **Gravité** moyen · `refund-policy/page.tsx` l.38, l.51 · `terms/page.tsx` art.06 l.91
- **Sinalite** : ToS fr_ca §11 « toutes les ventes sont finales » → réimpression uniquement.
- **Plio** : « on rembourse **100 %** » (l.38/51) ; CGU « soit réimpression, soit **remboursement intégral** » (l.91).
- **Exposition** : jusqu'à 100 % du COGS Sinalite par commande, non recouvrable.
- **Changement** : réimpression **en premier recours** partout ; remboursement cash « à notre discrétion ». (ou branche A budgétée)

### F2 — « 2 h pour annuler » + refund complet non honorable (aucun endpoint cancel, frais Sinalite ignorés)
- **Gravité** moyen · `refund-policy/page.tsx` l.62-66 · `admin/orders/[id]/cancel/route.ts` l.60-68, l.109-111 · `stripe-process.ts` l.405, l.453
- **Sinalite** : ToS §10 — annulable jusqu'au **« commencement of imposition »** (pas un délai horaire) ; **min. 25 $/job** (en_us) / **50 $ + frais carte** (fr_ca) ; labor/proof/admin déduits.
- **Plio** : « ~2 h après paiement → refund complet ». Le code soumet à Sinalite **immédiatement** (`sinalite.createOrder` juste après le webhook, aucun buffer) ; `cancel/route.ts` émet **toujours** un refund Stripe FULL et admet (TODO) qu'**aucun endpoint Sinalite cancel n'existe**.
- **Exposition** : 25-50 $ + frais/labor par annulation ; si déjà imposée, refund 100 % client mais Plio **reste facturé** = perte du COGS entier.
- **Changement** — **texte** : supprimer « 2 heures » → « tant que la production n'a pas commencé — souvent quelques minutes après le paiement » + « passé ce point, frais min. 25 $/article ». **Code (option B, `money-path-reviewer` obligatoire)** : vrai buffer de soumission (`after()`/cron) OU refund **partiel** (`amountCents − 2500¢`) quand SUBMITTED/imposé, reflété dans l'email.

### F3 — Refund « complet » sur changement d'avis vs Sinalite déduit toujours proof/labor/carte
- **Gravité** moyen · `cancel/route.ts` · `refund-policy` l.62 · `email-order-cancelled.html` l.57
- **Sinalite** : ToS §10 — frais labor/proof/carte **soustraits du crédit** + 25 $ min si imposé.
- **Changement** : refund partiel net (option B) OU décision A explicitée. Cesser de promettre « refund complet » inconditionnel.

### F4 — Crédit bonus 10 % : geste 100 % Plio, non couvert
- **Gravité** faible · `refund-policy` l.135 — décision business : garder (budgété) ou limiter au « Plio en tort avéré ».

### F5 — Réimpression « illimitée » vs Sinalite = un reprint puis crédit
- **Gravité** faible · `refund-policy` l.160 — retirer « illimitée » → « on réimprime ; si le défaut confirmé persiste, on **rembourse** plutôt que relancer indéfiniment ».

### F6 — Colis perdu : réimpression à l'aveugle vs Sinalite F.O.B. usine
- **Gravité** faible · `refund-policy` l.130
- **Sinalite** : ToS §12 — F.O.B. plant, recours au transporteur seul ; **ne réimprime pas** un colis perdu.
- **Changement** : garder comme différenciateur MAIS **provisionner** + envisager **assurance-colis** (declared value / Shipsurance) ; à défaut borner (plafond, « après confirmation de perte par le transporteur »).

### F7 — Perk GOLD « livraison gratuite peu importe le carrier » = Plio mange le transport plein
- **Gravité** moyen · `lib/customers/perks.ts` l.26-31
- **Sinalite** : gratuité **uniquement** GTA/Mtl/Ottawa, > 150 $, **exclut les custom orders** — or **toute commande Plio est custom** → Sinalite facture le transport plein.
- **Plio** : `applyShippingPerks` met `effectiveShippingPrice: 0` pour tout GOLD **sans condition**.
- **Exposition** : GOLD en région (UPS 30-90 $+) = 100 % absorbé, récurrent.
- **Changement** : **borner** — plafonner la remise, exclure Express/remote, ou modéliser le coût annuel réel.

### F8 — Couverture 100 % des erreurs fichier que Sinalite décline (P0)
- **Gravité** élevé · `refund-policy` l.38, l.155
- **Sinalite** : ToS — « NOT LIABLE for errors caused by bleeds, damaged fonts, files not built to template » + « Customer fully responsible for final proof » ; imprime **as-is**, refacture le 2e tirage.
- **Plio** : « bleed manquant non détecté… on rembourse **100 %** » ; « validateur couvre bleed, résolution, mode couleur, fonts ».
- **Exposition** : chaque faux négatif du validateur = **double perte** (Sinalite facture + Plio réimprime gratuit).
- **Changement** : (A) assumer + provisionner + ajouter en CGU « la validation auto est une assistance, ne remplace pas la vérification finale par l'utilisateur » ; OU (B) restreindre la garantie aux contrôles réellement effectués (cf. S1/S2).

---

## 3. ⚖️ Risques légaux / CGU — clauses Sinalite à répercuter

### L1 — Aucune clause de sur/sous-production 5 %
- **Gravité** moyen · `terms/page.tsx` art.06 l.90
- **Sinalite** : ToS §15 — « Overruns and underruns not to exceed **5%**… constitute an acceptable delivery. »
- **Plio** : liste « quantités inférieures » comme défaut **sans seuil**.
- **Changement** : « quantité inférieure de **plus de 5 %** » + clause « variation ≤ 5 % (± ) = livraison conforme, usage de l'industrie ».

### L2 — Tolérance de coupe non chiffrée (Sinalite : 0,0625"/1,6 mm par côté)
- **Gravité** faible · `terms` art.06 l.90 · `refund-policy` l.50, l.125 — chiffrer « **1/16 po (≈1,6 mm) par côté** ».

### L3 — « Obligation essentielle » élargit inutilement la brèche de responsabilité
- **Gravité** faible · `terms` art.08 l.105 — au QC l'exclusion de faute lourde/intentionnelle est impérative (art. 1474 C.c.Q.) ; **retirer « manquement à une obligation essentielle »** (va au-delà du minimum légal et de ce que Sinalite couvre).

### L4 — Indemnisation PI plus faible que le « indemnify and hold harmless » de Sinalite
- **Gravité** faible · `terms` art.07 l.96 — élargir à **diffamation, atteinte à la vie privée, frais et honoraires d'avocats** (miroir ToS §16).

### L5 — For Québec (Plio) vs Ontario (Sinalite) — **NE PAS corriger vers le client**
- `terms` art.09 l.110 — Montréal est **correct** pour un consommateur QC. Action **interne** : vérifier que le contrat-cadre Plio↔Sinalite permet de répercuter en Ontario ce que Plio paie au QC.

---

## 4. ❌ Inexactitudes factuelles (à corriger dans TOUS les cas)

### E1 — Garantie couleur **Delta-E ≤ 4** alors que Sinalite ne garantit AUCUN color matching (P0)
- **Gravité** moyen · `refund-policy` l.145 · `terms` art.06 l.90
- **Sinalite** : ToS §8 — « **does not guarantee color matching** » ; « reasonable variation… acceptable delivery ». Aucun ΔE chiffré.
- **Changement** : **retirer le chiffre Delta-E** → « écart écran RGB / presse CMYK inévitable et normal, non un défaut ; on imprime fidèlement au BAT CMYK validé ; épreuve physique 18 $ pour couleurs critiques ». Exclure explicitement UV/vernis.

### E2 — « CMYK » affiché sur des PDF que pdfme sort en RGB (P0)
- **Gravité** moyen · `lib/templates/render.ts` l.4-6 · `templates/page.tsx` l.42 · `DesignEditor.tsx` l.268
- **Sinalite** : « supply CMYK only files » ; « not responsible for color shift RGB→CMYK ».
- **Plio** : affiche « PDF print-ready **CMYK** » mais `render.ts` admet une sortie RGB et « un pass CMYK pourra être ajouté plus tard » — **aucun pass n'existe** (0 occurrence cmyk/ghostscript).
- **Changement** : (A) implémenter le pass CMYK (Ghostscript avant envoi Sinalite) ; OU (B) **retirer « CMYK »** → « converti CMYK à la presse ».

### E3 — « On vérifie automatiquement CMYK » alors que le validateur ne lit jamais la couleur (P0)
- **Gravité** moyen · `order/upload/page.tsx` l.199-200 · `page.tsx` l.141, l.226
- **Plio** : « On vérifie bleed, résolution et **CMYK** » — or `pdf-validator.ts`, `image-validator.ts`, `validate-file.ts` **délèguent** la couleur à Sinalite, jamais validée.
- **Changement** : (A) détecter le colorspace (`/DeviceRGB` vs `/DeviceCMYK`) ; OU (B) **retirer « CMYK »** de la liste des vérifs auto.

### E4/E5/E6 — « 2 h pour annuler » fictif · « impossible après presse » (faux, Sinalite l'autorise à 25 $) · frais 25 $ jamais mentionnés
- `refund-policy` l.62-66, l.63 — cf. F2. E5 : « annulation plus difficile, frais possibles (25 $/article), selon l'avancement ». E6 : ajouter une FAQ « Y a-t-il des frais pour annuler ? ».

### E7 — Délais fermes alors que Sinalite : « all turnaround times are **estimates** »
- **Gravité** faible · `email-order-confirmation.html` l.116/133 · `email-abandoned-cart.html` l.60 · `email-order-shipped.html` l.10 · `order/shipping/page.tsx` l.208
- **Changement** : langage estimatif (« typiquement 3-5 jours ouvrables selon le produit », « estimé, non garanti ») ou brancher sur le turnaround API réel.

### E8 — « Plus de 1 200 produits » codé en dur vs ~178 réels (P0, pub trompeuse)
- **Gravité** moyen · `page.tsx` l.157 · `email-welcome.html` l.71 — « des centaines de produits » ou injecter le compte dynamique réel (`order/start` l.173 l'affiche déjà).

### E9 — « Impression offset » affirmée à 100 % des commandes (fournisseur numérique selon le tirage)
- **Gravité** faible · `email-order-confirmation.html` l.125 — « impression, séchage, finition » (retirer « offset »).

### E10 — Blog : coupe « 0,5 mm » vs 1,588 mm réels
- **Gravité** faible · `content/blog/preparer-fichier-impression-pdf.tsx` l.46 — « jusqu'à ~1,5 mm (1/16") ».

### E11 — Grammages g/m² précis que Sinalite ne publie pas
- **Gravité** faible · `virtual-products.ts` + `ConfigureClient.tsx` + `samples` + blog — qualifier « ≈ » ou retirer le g/m².

---

## 5. 🔧 Incohérences produits / specs fichiers

### S1 — Validateur DPI accepte < 300 que Sinalite exige à 300
- **Gravité** moyen · `lib/print/image-validator.ts` l.23-25 — `WARN_DPI=150` → 150-299 DPI passe en 'ok' silencieux. Remonter `WARN_DPI=300` (avertir sous 300, message « sous le minimum Sinalite, flou non couvert »), garder ERROR à 100 (blocage dur).

### S2 — Garantie refund sur couleur/fonts que le validateur ne détecte PAS
- **Gravité** moyen · `refund-policy` l.155 — sortir « mode couleur » et « fonts » de la liste « détectables » (garder bleed/dimensions + résolution raster) OU implémenter les détections.

### S3 — Bleed imposé 1/8" alors que la page produit Sinalite cartes indique 1/16"
- **Gravité** faible · `pdf-validator.ts` l.240 — accepter ≥ 0,0625" sans warning sur cartes (« idéalement 1/8", minimum 1/16" accepté »).

### S4/S5 — Kraft « 300 g/m² » vs 18pt · Soft touch « 18pt » mappé sur stock 16pt (productId 7567)
- **Gravité** faible · `samples/page.tsx` l.27-29 — corriger vers `virtual-products.ts` (18pt ≈380 g/m² ; soft touch = 16pt, ou mapper un vrai 18pt).

### S6 — Enum ShipMethod inclut international mais pipeline verrouillé Canada
- **Gravité** faible · `lib/sinalite/types.ts` l.95-107 — documenter/retirer les 3 méthodes internationales tant que `ShipCountry='CA'`.

---

## 6. ✏️ Contenu & incohérences internes de délais

### C1 — Délai de réclamation contradictoire : 48 h (refund) vs 30 j (CGU) vs 10 j ouvrables (Sinalite)
- **Gravité** faible (à trancher) · `refund-policy` l.50, l.125 · `terms` art.06 l.89
- **Sinalite** : ToS §11 — « within **10 business days**… failing which Customer is deemed satisfied ».
- Au QC, l'ambiguïté d'un contrat d'adhésion s'interprète **contre le rédacteur** (art. 1432 C.c.Q.) → Plio de facto lié par 30 j, ET J+11→J+30 est **hors fenêtre Sinalite** (non recouvrable).
- **Changement** : **unifier** — porter le défaut qualité à **10 jours ouvrables** partout. **Règle interne** : toujours ouvrir le ticket Sinalite ≤ 10 jours ouvrables de la livraison.

### C2 — CGU (F.O.B. + réserve 24 h) vs refund (réimpression à nos frais) — harmoniser les deux docs.
### C3 — Cartes de vœux : Plio omet Foil/Kraft/Pearl que Sinalite propose (sous-offre, optionnel).

---

## 7. ⚠️ Points DOUTEUX — confirmer avant toute action

| # | Point | Statut | Action |
|---|-------|--------|--------|
| D1 | Blog « Postes Canada » vs code UPS/FedEx | **RÉFUTÉ** | Postes Canada EST un canal réel (échantillons, tracking). L'enum ShipMethod ne régit que les **devis de production Sinalite**. Ne pas « corriger » — au plus clarifier éditorialement. |
| D2 | Réimpression prepress « gratuit sous 48 h » | DOUTEUX | Se lit comme délai de **déclenchement**, pas de réception. Reformuler par prudence (« mise en production sous 48 h ouvrables »). |
| D3 | `our-guarantees` / `faq-custom` non fetchées | **SOURCE INVÉRIFIABLE** | Tout provient des **ToS** (contractuel) + Our Promise / Preparing. Revérifier manuellement les garanties marketing avant de figer les formulations couleur/délai. |
| D4 | ToS en_us ↔ fr_ca divergent (fr_ca plus restrictif : « aucun crédit », 50 $, retour 100 % à charge client) | **RISQUE EN SOI** | Confirmer **quelle version régit** le contrat Plio↔Sinalite. Les reco supposent la plus restrictive. |

---

## 8. Récapitulatif priorisé

| Prio | ID | Titre | Type | Fichier | Effort |
|------|----|-------|------|---------|--------|
| **P0** | F8 | Couverture 100 % erreurs fichier que Sinalite décline | Financier | `refund-policy` l.38/155 | Décision + texte |
| **P0** | F2/F3/E4/E6 | « 2 h annuler » + refund 100 % non honorable | Financier + factuel | `refund-policy` l.62-66 ; `cancel/route.ts` | Texte + (code) |
| **P0** | E1 | Delta-E ≤ 4 garanti (Sinalite ne garantit rien) | Factuel | `refund-policy` l.145 ; `terms` l.90 | Texte |
| **P0** | E2/E3 | « CMYK » affiché/validé alors que RGB non converti | Factuel | `render.ts` ; `templates` l.42 ; `DesignEditor` l.268 ; `upload` l.200 ; `page.tsx` l.141/226 | Texte (ou Ghostscript) |
| **P0** | F7 | Free shipping GOLD inconditionnel | Financier | `perks.ts` l.26-31 | Code (borne) |
| **P1** | L1 | Pas de clause sur/sous-production 5 % | Légal | `terms` l.90 | Texte |
| **P1** | S1 | Validateur DPI accepte < 300 | Spec | `image-validator.ts` l.23-25 | Code |
| **P1** | S2 | Refund couvre couleur/fonts non détectés | Spec + fin. | `refund-policy` l.155 | Texte |
| **P1** | E8 | « 1 200 produits » vs ~178 | Factuel | `page.tsx` l.157 ; `email-welcome` l.71 | Texte |
| **P1** | C1 | Délai réclamation 48 h/30 j/10 j | Cohérence | `refund-policy` l.50/125 ; `terms` l.89 | Texte + règle interne |
| **P1** | F1 | Refund cash 100 % vs réimpression fr_ca | Financier | `refund-policy` l.38/51 ; `terms` l.91 | Décision + texte |
| **P1** | E5 | « Impossible après presse » (faux) | Factuel | `refund-policy` l.63 | Texte |
| **P1** | L3 | « Obligation essentielle » | Légal | `terms` l.105 | Texte |
| **P2** | F4/F5/F6 | Bonus 10 % · réimpression illimitée · colis perdu | Financier | `refund-policy` l.135/160/130 | Décision |
| **P2** | L2/L4 | Coupe non chiffrée · indemnisation PI | Légal | `terms` l.90/96 | Texte |
| **P2** | E7/E9/E10/E11 | Délais fermes · offset · coupe 0,5 mm · g/m² | Factuel | emails + blog + `virtual-products` | Texte |
| **P2** | S3/S4/S5/S6 | Bleed cartes · kraft · soft touch · international | Spec | `pdf-validator` ; `samples` ; `types.ts` | Texte/code |
| **P2** | C2/C3/L5 | Cohérence livraison · greeting cards · for QC/ON | Divers | — | Doc/optionnel |

**Note** : aucun P0 ne touche les invariants money-critical du checkout → pas de `money-path-reviewer` requis **sauf** si on code F2/F3 branche B (refund partiel dans `cancel/route.ts`) — là il est **obligatoire**.
