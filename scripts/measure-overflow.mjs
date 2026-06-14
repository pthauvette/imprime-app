#!/usr/bin/env node
/**
 * measure-overflow.mjs — mesure l'overflow horizontal mobile (375px) page par page.
 *
 * Principe Plio : « l'overflow ne se LIT pas, il se MESURE » (cf. CLAUDE.md).
 * Charge chaque route PUBLIQUE à un viewport de 375px et compare
 * document.documentElement.scrollWidth à clientWidth. Sort en code 1 si une
 * page déborde → utilisable comme garde de non-régression.
 *
 * Usage :
 *   pnpm dev            # (dans un autre terminal — port 3000)
 *   node scripts/measure-overflow.mjs
 *   BASE_URL=http://localhost:3100 node scripts/measure-overflow.mjs   # build prod local
 *
 * Réutilise Playwright déjà présent (@playwright/test). Pas de nouvelle dépendance.
 *
 * ⚠️ Couvre les pages publiques rendables en dev. Les pages auth-gated
 * (/account, /admin, wizard /order/*, /settings) ne sont pas rendables sans
 * session → pour celles-là, audit d'ordre source dans globals.css.
 */

import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 375, height: 812 }; // iPhone X-ish, largeur critique

// Routes publiques (pas de session requise). En ajouter ici au besoin.
const ROUTES = [
  '/',
  '/about',
  '/pricing',
  '/quote',
  '/contact',
  '/help',
  '/samples',
  '/templates',
  '/compare',
  '/reseller',
  '/blog',
  '/status',
  '/mcp',
  '/sign-in',
  '/sign-up',
];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  const results = [];
  for (const route of ROUTES) {
    const url = `${BASE_URL}${route}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      // Laisse le layout se stabiliser (fontes, images, hydration).
      await page.waitForTimeout(300);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      const overflow = scrollWidth - clientWidth;
      results.push({ route, scrollWidth, clientWidth, overflow, error: null });
    } catch (err) {
      results.push({ route, scrollWidth: 0, clientWidth: 0, overflow: 0, error: err.message });
    }
  }

  await browser.close();

  // Rapport.
  let failed = 0;
  let unreachable = 0;
  console.log(`\nOverflow scan @ ${VIEWPORT.width}px — ${BASE_URL}\n`);
  for (const r of results) {
    if (r.error) {
      unreachable++;
      console.log(`  ?  ${r.route.padEnd(16)} INJOIGNABLE (${r.error.split('\n')[0]})`);
    } else if (r.overflow > 0) {
      failed++;
      console.log(`  ✗  ${r.route.padEnd(16)} OVERFLOW +${r.overflow}px  (sw ${r.scrollWidth} > cw ${r.clientWidth})`);
    } else {
      console.log(`  ✓  ${r.route.padEnd(16)} OK  (sw ${r.scrollWidth} ≤ cw ${r.clientWidth})`);
    }
  }
  console.log('');

  if (unreachable === results.length) {
    console.error('Aucune route joignable — le serveur dev tourne-t-il ? Lance `pnpm dev` (port 3000).');
    process.exit(2);
  }
  if (failed > 0) {
    console.error(`${failed} page(s) en overflow horizontal à 375px. Cf. CLAUDE.md § CSS / overflow pour le diagnostic de cause.`);
    process.exit(1);
  }
  console.log('Aucun overflow horizontal détecté sur les pages publiques. ✓');
  process.exit(0);
}

main().catch((err) => {
  console.error('measure-overflow a échoué :', err);
  process.exit(2);
});
