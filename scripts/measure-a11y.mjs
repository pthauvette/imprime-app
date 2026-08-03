/**
 * Mesure d'accessibilité — pages publiques.
 *
 * Même principe que measure-overflow.mjs : l'a11y ne se LIT pas dans le JSX,
 * elle se MESURE sur le DOM rendu. Un `aria-label` peut être présent dans le
 * code et écrasé par un composant, un contraste peut être conforme en variable
 * CSS et cassé par la valeur effectivement héritée.
 *
 * Réutilise Playwright déjà présent (@playwright/test). Pas de nouvelle
 * dépendance — pas d'axe-core : les règles ci-dessous sont peu nombreuses mais
 * choisies pour leur TAUX DE FAUX POSITIFS quasi nul, ce qui rend le rapport
 * actionnable tel quel plutôt qu'à trier.
 *
 * Ce qui est vérifié (et pourquoi ces règles-là) :
 *  · nom accessible des contrôles — un bouton sans nom est INUTILISABLE au
 *    lecteur d'écran, pas juste dégradé ;
 *  · alt des images — même chose ;
 *  · étiquette des champs de formulaire — bloque la saisie assistée ;
 *  · hiérarchie des titres — un saut h1→h3 casse la navigation par titres,
 *    principal mode de survol d'une page au lecteur d'écran ;
 *  · contraste du texte — seuils WCAG AA (4.5:1, ou 3:1 pour le grand texte).
 *
 * Usage : node scripts/measure-a11y.mjs [route…]   (défaut : toutes)
 */

import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : [
  '/', '/about', '/pricing', '/quote', '/contact', '/help',
  // '/templates' retiré : derrière le compte depuis 2026-08 — sinon on mesure
  // l'accessibilité de la page de connexion en croyant mesurer la sienne.
  '/compare', '/reseller', '/blog', '/status', '/sign-in', '/sign-up',
  '/track', '/search', '/legal/terms', '/legal/privacy', '/legal/refund-policy',
  '/order/start',
  '/order/product?category=cartes-de-visite',
  '/order/v/cartes-de-visite',
  '/order/configure?productId=1',
  '/order/upload?productId=1',
  '/order/shipping?productId=1',
];

/** Luminance relative WCAG. */
function luminance([r, g, b]) {
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contraste(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const AUDIT = () => {
  const parseRgb = (s) => {
    const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  /**
   * Remonte jusqu'au premier fond OPAQUE — un fond transparent ne « compte » pas.
   *
   * Renvoie `null` si un DÉGRADÉ (ou une image) est rencontré en chemin :
   * `backgroundColor` vaut alors `transparent` et poursuivre la remontée
   * donnerait la couleur d'un ancêtre qui n'est PAS ce qu'on voit à l'écran.
   * Première version du script : elle rapportait « 1,00:1 » sur le panneau
   * dégradé de /sign-in — un faux positif spectaculaire (le vrai souci y était
   * réel, mais découvert à la capture, pas par cette mesure). Mieux vaut ne
   * rien affirmer que d'affirmer faux : un rapport qu'il faut trier n'est plus
   * un rapport actionnable.
   */
  const fondEffectif = (el) => {
    let e = el;
    while (e) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parseRgb(cs.backgroundColor);
      if (c && c.a >= 0.95) return c.rgb;
      e = e.parentElement;
    }
    return [255, 255, 255];
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const nomAccessible = (el) =>
    (el.getAttribute('aria-label')
      || el.getAttribute('title')
      || (el.getAttribute('aria-labelledby')
          && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent)
      || el.textContent
      || (el.querySelector('img')?.getAttribute('alt') ?? '')
    ).trim();

  const pb = { sansNom: [], sansAlt: [], champsSansLabel: [], titres: [], contraste: [] };

  for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
    if (!visible(el)) continue;
    if (!nomAccessible(el)) {
      pb.sansNom.push({ tag: el.tagName.toLowerCase(), cls: (el.className?.toString?.() || '').slice(0, 45), html: el.outerHTML.slice(0, 90) });
    }
  }

  for (const img of document.querySelectorAll('img')) {
    if (!visible(img)) continue;
    if (img.getAttribute('alt') === null) {
      pb.sansAlt.push({ src: (img.getAttribute('src') || '').slice(0, 70) });
    }
  }

  for (const f of document.querySelectorAll('input, select, textarea')) {
    if (!visible(f)) continue;
    const t = f.getAttribute('type');
    if (t === 'hidden' || t === 'submit' || t === 'button') continue;
    const id = f.getAttribute('id');
    const aLabel = f.getAttribute('aria-label')
      || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`))
      || f.closest('label')
      || f.getAttribute('aria-labelledby');
    if (!aLabel) {
      pb.champsSansLabel.push({ type: t || f.tagName.toLowerCase(), name: f.getAttribute('name') || '', ph: (f.getAttribute('placeholder') || '').slice(0, 40) });
    }
  }

  const niveaux = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(visible).map((h) => ({ n: +h.tagName[1], txt: h.textContent.trim().slice(0, 45) }));
  const nbH1 = niveaux.filter((h) => h.n === 1).length;
  if (nbH1 !== 1) pb.titres.push({ souci: `${nbH1} <h1>`, txt: niveaux.filter((h) => h.n === 1).map((h) => h.txt).join(' | ').slice(0, 70) });
  for (let i = 1; i < niveaux.length; i++) {
    if (niveaux[i].n - niveaux[i - 1].n > 1) {
      pb.titres.push({ souci: `saut h${niveaux[i - 1].n}→h${niveaux[i].n}`, txt: niveaux[i].txt });
    }
  }

  const vus = new Set();
  for (const el of document.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
    if (!direct) continue;
    const cs = getComputedStyle(el);
    const fg = parseRgb(cs.color);
    if (!fg || fg.a < 0.95) continue;
    const bg = fondEffectif(el);
    if (!bg) continue; // fond non déterminable (dégradé/image) — on n'invente pas
    const taille = parseFloat(cs.fontSize);
    const gras = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    const grand = taille >= 24 || (taille >= 18.66 && gras);
    const cle = `${cs.color}|${bg.join(',')}|${grand}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    pb.contraste.push({
      fg: fg.rgb, bg, taille: Math.round(taille), grand,
      cls: (el.className?.toString?.() || el.tagName.toLowerCase()).slice(0, 45),
      txt: el.textContent.trim().slice(0, 40),
    });
  }
  return pb;
};

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  let total = 0;

  console.log(`\nAudit a11y — ${BASE_URL}\n`);

  for (const route of ROUTES) {
    let r;
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 25000 });
      r = await page.evaluate(AUDIT);
    } catch (e) {
      console.log(`  ⚠  ${route} — injoignable (${e.message.split('\n')[0].slice(0, 50)})`);
      continue;
    }

    const faibles = r.contraste
      .map((c) => ({ ...c, ratio: contraste(c.fg, c.bg) }))
      .filter((c) => c.ratio < (c.grand ? 3 : 4.5));

    const n = r.sansNom.length + r.sansAlt.length + r.champsSansLabel.length + r.titres.length + faibles.length;
    total += n;
    if (n === 0) { console.log(`  ✓  ${route}`); continue; }

    console.log(`  ✗  ${route} — ${n} problème(s)`);
    for (const x of r.sansNom) console.log(`       nom accessible manquant · <${x.tag}> ${x.html}`);
    for (const x of r.sansAlt) console.log(`       alt manquant · ${x.src}`);
    for (const x of r.champsSansLabel) console.log(`       champ sans étiquette · ${x.type} name="${x.name}" placeholder="${x.ph}"`);
    for (const x of r.titres) console.log(`       titres · ${x.souci} — « ${x.txt} »`);
    for (const x of faibles) {
      console.log(`       contraste ${x.ratio.toFixed(2)}:1 (min ${x.grand ? 3 : 4.5}) · ${x.taille}px .${x.cls} — « ${x.txt} »`);
    }
  }

  console.log(total === 0 ? '\nAucun problème détecté. ✓\n' : `\n${total} problème(s) au total.\n`);
  await browser.close();
  process.exit(total > 0 ? 1 : 0);
}

main();
