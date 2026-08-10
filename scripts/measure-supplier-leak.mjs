#!/usr/bin/env node
/**
 * measure-supplier-leak.mjs — le site parle-t-il français, et garde-t-il pour
 * lui le jargon du fournisseur ?
 *
 * Même principe que `measure-overflow.mjs` : on ne LIT pas le code, on MESURE
 * le rendu. Charge chaque route publique et cherche dans le TEXTE VISIBLE deux
 * familles de fuites, toutes deux constatées en production en 2026-08 :
 *
 *   1. JARGON FOURNISSEUR — « Business cards 14pt (Profit Maximizer) »,
 *      « (High Gloss) », « (C1S) ». Ce sont des noms de PALIERS DE MARGE et de
 *      codes d'atelier Sinalite. `/compare` les affichait aux clients sur une
 *      page publique indexée (#563), alors que la couche de noms marketing
 *      existait déjà depuis #542.
 *
 *   2. ANGLAIS RÉSIDUEL — « Next Business Day », « No bundling - FREE »,
 *      « Shrink Wrap - 100s ». Mesuré : 45 % des valeurs d'options du catalogue
 *      (#565), sur une boutique qui promet « jamais traduit à la machine ».
 *
 * Les deux ont la même cause : une couche de présentation existait mais n'avait
 * pas été branchée PARTOUT. Un test unitaire ne les attrape pas — il faut
 * regarder ce qui sort.
 *
 * ⚠️ CE QUI EST TOLÉRÉ ET POURQUOI. Les noms de PAPIERS et de FINITIONS restent
 * volontairement en anglais (« 14PT Printed 2 Sides (4/4) », « Gloss AQ ») :
 * ce sont des identités produit, une traduction approximative ferait acheter
 * autre chose que ce qui sera imprimé (cf. `lib/products/option-i18n.ts`). Ils
 * sont donc dans TOLERE ci-dessous. Retirer une entrée de cette liste doit être
 * une décision, pas un oubli.
 *
 * Usage :
 *   pnpm dev            # autre terminal, port 3000
 *   node scripts/measure-supplier-leak.mjs
 */

import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

/** Routes publiques où un client peut atterrir. */
const ROUTES = [
  '/',
  '/order/start',
  '/order/product?category=cartes-de-visite',
  '/order/v/cartes-de-visite',
  '/order/configure?productId=1',
  '/order/configure?productId=69',   // le plus fourni en options de service
  '/order/configure?productId=97',
  // ⚠️ ANGLE MORT CORRIGÉ (2026-08). La liste ne contenait que des cartes et
  // des flyers, d'où la conclusion — fausse — que #565 avait tout traduit. Les
  // BROCHURES, LIVRETS et CHEMISES portent dix groupes d'options que les autres
  // familles n'ont pas (Fold Type, Binding, Pockets, Cover, Lamination…) : une
  // capture d'écran d'une brochure a montré « Fold Type » et « Do you have a
  // folding sample? » en clair, des semaines après le « c'est traduit ».
  // Un scanner ne vaut que ce que couvre sa liste de routes.
  '/order/configure?productId=43',    // brochure — Fold Type (16 valeurs)
  '/order/configure?productId=58',    // chemise de présentation — Pockets
  '/order/configure?productId=14679', // livret — Binding, Cover, Lamination
  // Ces deux étapes affichent désormais le NOM du produit dans leur
  // récapitulatif (avant : « Produit #97 », ou rien du tout). Elles deviennent
  // donc des surfaces de fuite possibles — on les ajoute EN MÊME TEMPS que le
  // nom, pas après coup. C'est l'oubli inverse qui a produit #571.
  '/order/upload?productId=1',
  '/order/shipping?productId=1&options=30,4',
  '/compare?ids=1,7,12',
  '/pricing',
  '/blog/comment-choisir-papier-cartes-de-visite',
  '/help',
  '/quote',
];

import { analyser } from './lib/supplier-leak.mjs';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const resultats = [];

  for (const route of ROUTES) {
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(400);
      // innerText = ce que le client LIT. Le HTML brut contiendrait la charge
      // RSC (données sérialisées), où l'anglais est normal et attendu.
      const texte = await page.evaluate(() => document.body.innerText);
      resultats.push({ route, fuites: analyser(texte), erreur: null });
    } catch (err) {
      resultats.push({ route, fuites: [], erreur: err.message.split('\n')[0] });
    }
  }
  await browser.close();

  console.log(`\nFuites fournisseur / anglais résiduel — ${BASE_URL}\n`);
  let enFaute = 0;
  let injoignables = 0;
  for (const r of resultats) {
    if (r.erreur) {
      injoignables++;
      console.log(`  ?  ${r.route}  INJOIGNABLE (${r.erreur})`);
    } else if (r.fuites.length) {
      enFaute++;
      console.log(`  ✗  ${r.route}`);
      for (const f of r.fuites) console.log(`       ${f.quoi}\n         → ${f.exemples.join(' · ')}`);
    } else {
      console.log(`  ✓  ${r.route}`);
    }
  }
  console.log('');

  if (injoignables === resultats.length) {
    console.error('Aucune route joignable — `pnpm dev` tourne-t-il sur le port 3000 ?');
    process.exit(2);
  }
  if (enFaute > 0) {
    console.error(`${enFaute} page(s) exposent du jargon fournisseur ou de l'anglais non traduit.`);
    process.exit(1);
  }
  console.log('Aucune fuite détectée sur les pages publiques. ✓');
  process.exit(0);
}

main().catch((err) => {
  console.error('measure-supplier-leak a échoué :', err);
  process.exit(2);
});
