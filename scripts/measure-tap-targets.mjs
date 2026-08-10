#!/usr/bin/env node
/**
 * measure-tap-targets.mjs — le site se manipule-t-il au pouce ?
 *
 * Troisième instrument de la famille « on ne LIT pas, on MESURE » (après
 * `measure-overflow.mjs` et `measure-a11y.mjs`). Charge chaque route publique à
 * 375px et mesure deux choses que ni l'un ni l'autre ne voit :
 *
 *   1. LA TAILLE DES CIBLES TACTILES. Mesuré en 2026-08 sur la prod :
 *      « Se connecter » de l'en-tête faisait 83×20px — sous le minimum WCAG
 *      2.5.8 (24×24) et à moins de la moitié des 44px recommandés. Un lien de
 *      compte qu'on rate au pouce, sur toutes les pages marketing.
 *
 *   2. LE COÛT VERTICAL DE L'EN-TÊTE. La barre marketing n'a pas de menu
 *      mobile : à 375px ses 6 liens + CTA + bloc compte PASSENT À LA LIGNE et
 *      occupaient 209px, soit 26% d'un écran de 812px, avant le moindre
 *      contenu. Aucune mesure existante ne pouvait le signaler : il n'y a ni
 *      débordement horizontal ni défaut de contraste.
 *
 * ⚠️ CE QUI EST EXCLU, ET POURQUOI. WCAG 2.5.8 exempte explicitement les liens
 * EN LIGNE dans un bloc de texte : les souligner d'une zone de 44px déformerait
 * la prose. On ignore donc les ancres dont le parent est un <p>/<li> porteur de
 * texte. Sans cette exemption le rapport crierait sur chaque article de blog et
 * finirait désactivé.
 *
 * Deux seuils, à ne pas confondre :
 *   - < 24px : ÉCHEC WCAG 2.5.8 (AA, WCAG 2.2). C'est une norme.
 *   - 24–43px : sous la recommandation Apple (44) / Google (48). C'est un avis.
 *
 * Usage :
 *   node scripts/measure-tap-targets.mjs
 *   BASE_URL=https://www.plio.ca node scripts/measure-tap-targets.mjs
 */

import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const LARGEUR = 375;
const HAUTEUR = 812;

/** Seuil au-delà duquel un en-tête mange trop d'écran, en % de la hauteur. */
const BUDGET_ENTETE_PCT = 15;

const ROUTES = [
  '/',
  '/about',
  '/pricing',
  '/help',
  '/contact',
  '/quote',
  '/blog',
  '/blog/comment-choisir-papier-cartes-de-visite',
  '/track',
  '/search',
  '/compare?ids=1,7,12',
  '/sign-in',
  '/sign-up',
  '/legal/terms',
  '/legal/privacy',
  '/order/start',
  '/order/product?category=cartes-de-visite',
  '/order/configure?productId=1',
];

async function mesurer(page) {
  return page.evaluate(
    ({ hauteurEcran }) => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
      };

      // WCAG 2.5.8 : exemption « lien en ligne dans une phrase ou un bloc de
      // texte ». Le critère porte sur la PHRASE, pas sur la balise du parent —
      // premier jet : liste blanche de balises (P, LI, SPAN…), qui manquait
      // « Tu as un compte ? <a>Connecte-toi</a> pour voir tes commandes » parce
      // que le parent était un <div>. Un lien parfaitement conforme signalé
      // comme faute : c'est le genre de faux positif qui fait désactiver un
      // rapport.
      const enLigneDansDuTexte = (el) => {
        if (el.tagName !== 'A') return false;
        // Un lien de NAVIGATION n'est jamais « en ligne dans une phrase », quel
        // que soit son voisinage — fil d'Ariane, nav minimaliste, menu.
        if (el.closest('nav')) return false;
        // La bonne granularité : les nœuds TEXTE ENFANTS DIRECTS du parent.
        // Deux essais ratés avant celui-ci, chacun instructif —
        //   1. tout le texte du parent (`textContent`) : un « ← Retour » seul
        //      dans un panneau bavard passait pour de la prose ;
        //   2. le seul voisin immédiat : défait par JSX, où `{' '}` scinde la
        //      phrase en nœuds de texte séparés dont un ne contient qu'un
        //      espace.
        const p = el.parentElement;
        if (!p) return false;
        const texteDirect = [...p.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent)
          .join(' ')
          .trim();
        // 3 mots : « Tu as un compte ? … pour voir tes commandes » exempte,
        // « Courriel : » non.
        return texteDirect.split(/\s+/).filter(Boolean).length >= 3;
      };

      const cibles = [...document.querySelectorAll('a, button, [role="button"], input[type="submit"]')]
        .filter(visible)
        .filter((el) => !enLigneDansDuTexte(el))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            texte: (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 40),
            l: Math.round(r.width),
            h: Math.round(r.height),
          };
        });

      // ⚠️ On cherche la CHROME DE NAVIGATION, pas « un élément nommé header ».
      // Premier jet : `querySelector('header')` en repli — il attrapait
      // `header.legal-header` sur /legal/*, qui est le BLOC-TITRE de la page
      // (surtitre + h1 + intro + bandeau conformité). Il mesurait 561px et le
      // rapport annonçait « en-tête = 69% de l'écran » : un titre éditorial
      // compté comme un coût de navigation. Un `<header>` sans `<nav>` ni liens
      // n'est pas de la navigation.
      // Les deux chromes CONNUES sont mesurées telles quelles ; un `<header>`
      // générique ne compte que s'il porte une vraie navigation.
      const brut = document.querySelector('header');
      const entete =
        document.querySelector('.mkt-nav') ??
        document.querySelector('.shell-header') ??
        (brut && brut.querySelector('nav') ? brut : null);
      const hEntete = entete ? Math.round(entete.getBoundingClientRect().height) : null;

      return {
        echecsWcag: cibles.filter((c) => c.h < 24 || c.l < 24),
        souRecommande: cibles.filter((c) => (c.h >= 24 && c.h < 44) || (c.l >= 24 && c.l < 44)),
        total: cibles.length,
        hEntete,
        pctEntete: hEntete === null ? null : Math.round((hEntete / hauteurEcran) * 100),
      };
    },
    { hauteurEcran: HAUTEUR },
  );
}

async function main() {
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage({ viewport: { width: LARGEUR, height: HAUTEUR } });
  const resultats = [];

  for (const route of ROUTES) {
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(400);
      const ferme = await mesurer(page);

      // ⚠️ Mesurer seulement l'état FERMÉ ne voit RIEN du menu : ses liens
      // n'existent pas encore, et le bouton lui-même change de taille. Constaté
      // en 2026-08 — une fois ouvert, le bouton tombait de 44×44 à 24×44, or
      // c'est la cible qu'il faut atteindre pour refermer. On ouvre donc tout
      // repli présent et on fusionne les deux états.
      let ouvert = null;
      if (await page.locator('.mkt-burger').count()) {
        await page.click('.mkt-burger');
        await page.waitForTimeout(250);
        ouvert = await mesurer(page);
      }

      const dedupe = (liste) => {
        const vus = new Set();
        return liste.filter((c) => {
          const cle = `${c.texte}|${c.l}×${c.h}`;
          if (vus.has(cle)) return false;
          vus.add(cle);
          return true;
        });
      };

      const fusion = ouvert
        ? {
            ...ferme,
            echecsWcag: dedupe([...ferme.echecsWcag, ...ouvert.echecsWcag]),
            total: Math.max(ferme.total, ouvert.total),
            // La hauteur retenue est celle du menu FERMÉ : c'est l'état par
            // défaut, et le coût qu'on cherche à borner. Un panneau ouvert a le
            // droit d'être grand, l'utilisateur vient de le demander.
          }
        : ferme;

      resultats.push({ route, ...fusion, erreur: null });
    } catch (err) {
      resultats.push({ route, erreur: err.message.split('\n')[0] });
    }
  }
  await navigateur.close();

  console.log(`\nCibles tactiles & poids de l'en-tête — ${BASE_URL} @ ${LARGEUR}×${HAUTEUR}\n`);
  let echecs = 0;
  let enteteLourde = 0;
  let injoignables = 0;

  for (const r of resultats) {
    if (r.erreur) {
      injoignables++;
      console.log(`  ?  ${r.route}  INJOIGNABLE (${r.erreur})`);
      continue;
    }
    const soucis = [];
    if (r.echecsWcag.length) {
      echecs++;
      soucis.push(
        `${r.echecsWcag.length} cible(s) < 24px — ÉCHEC WCAG 2.5.8\n` +
          r.echecsWcag.map((c) => `         « ${c.texte} » ${c.l}×${c.h}`).join('\n'),
      );
    }
    if (r.pctEntete !== null && r.pctEntete > BUDGET_ENTETE_PCT) {
      enteteLourde++;
      soucis.push(`en-tête ${r.hEntete}px = ${r.pctEntete}% de l'écran (budget ${BUDGET_ENTETE_PCT}%)`);
    }

    if (soucis.length) console.log(`  ✗  ${r.route}\n       ${soucis.join('\n       ')}`);
    else console.log(`  ✓  ${r.route}  (${r.total} cibles, en-tête ${r.pctEntete ?? '—'}%)`);
  }
  console.log('');

  if (injoignables === resultats.length) {
    console.error('Aucune route joignable — `pnpm dev` tourne-t-il, ou BASE_URL est-elle bonne ?');
    process.exit(2);
  }
  if (echecs || enteteLourde) {
    console.error(
      `${echecs} page(s) avec des cibles sous le minimum WCAG · ${enteteLourde} page(s) à l'en-tête trop lourd.`,
    );
    process.exit(1);
  }
  console.log('Cibles tactiles et en-têtes conformes. ✓');
  process.exit(0);
}

main().catch((err) => {
  console.error('measure-tap-targets a échoué :', err);
  process.exit(2);
});
