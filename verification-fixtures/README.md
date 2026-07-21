# Fixtures de vérification — upload / aperçu fichier Plio

PDF de test « cartes d'affaires » (famille `cartes-de-visite` : trim **3,5 × 2 po**,
bleed **0,125 po/côté**). Générés par `scripts/gen-verification-fixtures.mjs` et
**vérifiés contre le vrai code de validation** (`assessPdfBytes` + pipeline DPI pdfjs).

Pour tester : lance une commande « Cartes d'affaires » sur le site, va à l'étape de
téléversement, et dépose chaque fichier. Résultat attendu (prouvé, pas supposé) :

| Fichier | Résultat attendu | Ce qu'il vérifie |
|---|---|---|
| `carte-CONFORME-3.5x2-bleed.pdf` | ✅ **Accepté, aucun avertissement**. L'aperçu montre l'illustration ; l'overlay **trim (orange) et safe (vert pointillé) doit coïncider avec les cadres dessinés dans le fichier**. | Alignement de l'overlay (#402/#403), acceptation format exact. |
| `carte-IMAGE-BASSE-RES.pdf` | ⚠️ **Avertissement DPI non bloquant** : « image intégrée en très basse résolution (~32 DPI) ». On peut continuer. | Estimation DPI des images intégrées (#407, warning-only). |
| `carte-SANS-FOND-PERDU.pdf` | ⚠️ **Avertissement `bleed-missing`** : bonne taille mais pas de fond perdu, invite à ajouter 0,125 po. | Détection de l'absence de bleed. |
| `carte-MAUVAISE-TAILLE-5x3.pdf` | ❌/⚠️ **Format 5×3 ≠ 3,5×2** : bloqué à l'upload web strict (#388) / avertissement côté MCP. | Rejet de la mauvaise taille. |

## Notes
- Le cadre **orange = ligne de coupe (trim)**, le **vert pointillé = zone sûre (safe)**
  sont dessinés à leur position réelle dans `carte-CONFORME` : l'overlay de l'app doit
  se superposer dessus. S'il est décalé → régression d'alignement.
- `carte-IMAGE-BASSE-RES` a la **même géométrie conforme** : son seul défaut est le DPI,
  ce qui isole proprement l'avertissement #407.
- Regénérer : `node scripts/gen-verification-fixtures.mjs` (auto-vérifie géométrie + DPI).
- Dossier non suivi par git — supprimable après la vérif.
