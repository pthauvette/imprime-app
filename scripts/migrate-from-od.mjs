#!/usr/bin/env node
/**
 * Converts Open Design HTML artifacts into Next.js Server Component pages.
 *
 * Usage:
 *   node scripts/migrate-from-od.mjs
 *
 * Pour chaque page :
 *   1. Fetch HTML depuis http://127.0.0.1:54841/api/projects/imprime/raw/<file>
 *   2. Extract <style> + <body>
 *   3. Convert HTML markup → JSX (className, htmlFor, self-closing, etc.)
 *   4. Convert inline `style="..."` → React style object
 *   5. Strip <script> blocks (TODO: convert interactive ones to client components)
 *   6. Write to src/app/<route>/page.tsx
 *   7. Append unique styles to src/styles/migrated-pages.css
 *
 * Cleanup manuel attendu après pour:
 *   - Imports (Sidebar, etc.)
 *   - Real data fetching
 *   - Client interactivity (wizards, dropdowns)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OD_BASE = 'http://127.0.0.1:54841/api/projects/imprime/raw';
const STYLES_OUT = join(ROOT, 'src/styles/migrated-pages.css');

const PAGES = [
  // Public
  { html: 'landing.html', route: 'page.tsx', name: 'LandingPage', title: 'Imprime — Print wholesale au Canada' },
  { html: 'pricing.html', route: 'pricing/page.tsx', name: 'PricingPage', title: 'Tarifs — Imprime' },
  { html: 'reseller.html', route: 'reseller/page.tsx', name: 'ResellerPage', title: 'Programme reseller — Imprime' },
  { html: 'help.html', route: 'help/page.tsx', name: 'HelpPage', title: 'Centre d\'aide — Imprime' },
  { html: 'signin.html', route: 'sign-in/page.tsx', name: 'SignInPage', title: 'Connexion — Imprime' },
  { html: 'signup.html', route: 'sign-up/page.tsx', name: 'SignUpPage', title: 'Créer un compte — Imprime' },
  { html: 'magic-link-sent.html', route: 'sign-in/sent/page.tsx', name: 'MagicLinkSentPage', title: 'Vérifie ta boîte courriel — Imprime' },

  // System (errors)
  { html: 'not-found.html', route: 'not-found.tsx', name: 'NotFound', title: '404 — Imprime' },
  // 500 is handled via error.tsx (Client Component); skip for now

  // Wizard
  { html: 'welcome.html', route: 'order/start/page.tsx', name: 'OrderStartPage', title: 'Quoi imprimer ?' },
  { html: 'product-picker.html', route: 'order/product/page.tsx', name: 'ProductPickerPage', title: 'Quel produit ?' },
  { html: 'configure.html', route: 'order/configure/page.tsx', name: 'ConfigurePage', title: 'Configure ta commande' },
  { html: 'quantity.html', route: 'order/quantity/page.tsx', name: 'QuantityPage', title: 'Combien d\'unités ?' },
  { html: 'upload.html', route: 'order/upload/page.tsx', name: 'UploadPage', title: 'Téléverse ton design' },
  { html: 'shipping.html', route: 'order/shipping/page.tsx', name: 'ShippingPage', title: 'Livraison' },
  { html: 'review.html', route: 'order/review/page.tsx', name: 'ReviewPage', title: 'Dernière vérification' },
  { html: 'confirmation.html', route: 'order/confirmation/page.tsx', name: 'ConfirmationPage', title: 'C\'est imprimé' },

  // Account (orders already done manually)
  { html: 'order-detail.html', route: 'orders/[id]/page.tsx', name: 'OrderDetailPage', title: 'Suivi commande — Imprime' },
  { html: 'wallet.html', route: 'wallet/page.tsx', name: 'WalletPage', title: 'Portefeuille — Imprime' },
  { html: 'payments.html', route: 'payments/page.tsx', name: 'PaymentsPage', title: 'Paiements — Imprime' },
  { html: 'addresses.html', route: 'addresses/page.tsx', name: 'AddressesPage', title: 'Adresses — Imprime' },
  { html: 'drafts.html', route: 'drafts/page.tsx', name: 'DraftsPage', title: 'Brouillons — Imprime' },
  { html: 'referrals.html', route: 'referrals/page.tsx', name: 'ReferralsPage', title: 'Parrainage — Imprime' },
  { html: 'account-settings.html', route: 'settings/page.tsx', name: 'SettingsPage', title: 'Paramètres — Imprime' },

  // Tools
  { html: 'samples.html', route: 'samples/page.tsx', name: 'SamplesPage', title: 'Échantillons — Imprime' },
  { html: 'templates.html', route: 'templates/page.tsx', name: 'TemplatesPage', title: 'Templates & guides — Imprime' },

  // Design system (showcase)
  { html: 'design-system.html', route: 'design-system/page.tsx', name: 'DesignSystemPage', title: 'Design System — Imprime' },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────

async function fetchPage(name) {
  const r = await fetch(`${OD_BASE}/${name}`);
  if (!r.ok) throw new Error(`Fetch ${name} → ${r.status}`);
  return await r.text();
}

function extractStyle(html) {
  const matches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  return matches.map((m) => m[1]).join('\n');
}

function extractBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  return m ? m[1] : html;
}

const VOID_TAGS = new Set([
  // HTML void elements
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
  // SVG elements typically used as void in our designs
  'path', 'line', 'polyline', 'polygon', 'circle', 'rect', 'ellipse',
  'use', 'stop', 'mpath', 'animate', 'animateTransform',
]);

const ATTR_RENAMES = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  autofocus: 'autoFocus',
  crossorigin: 'crossOrigin',
  maxlength: 'maxLength',
  minlength: 'minLength',
  charset: 'charSet',
  readonly: 'readOnly',
  cellpadding: 'cellPadding',
  cellspacing: 'cellSpacing',
  rowspan: 'rowSpan',
  colspan: 'colSpan',
  enctype: 'encType',
  formaction: 'formAction',
  novalidate: 'noValidate',
  spellcheck: 'spellCheck',
  contenteditable: 'contentEditable',
  fillrule: 'fillRule',
  stroketext: 'strokeText',
  strokewidth: 'strokeWidth',
  strokelinecap: 'strokeLinecap',
  strokelinejoin: 'strokeLinejoin',
  strokedasharray: 'strokeDasharray',
  strokedashoffset: 'strokeDashoffset',
  viewbox: 'viewBox',
  preserveaspectratio: 'preserveAspectRatio',
  clippath: 'clipPath',
  textanchor: 'textAnchor',
};

function camelize(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function inlineStyleToObject(css) {
  const obj = {};
  for (const rule of css.split(';')) {
    const idx = rule.indexOf(':');
    if (idx < 0) continue;
    const key = rule.slice(0, idx).trim();
    const value = rule.slice(idx + 1).trim();
    if (!key || !value) continue;
    // CSS custom properties keep their dashed form (--bg-canvas)
    const reactKey = key.startsWith('--') ? key : camelize(key);
    obj[reactKey] = value;
  }
  return obj;
}

function formatStyleObject(obj) {
  const entries = Object.entries(obj).map(([k, v]) => {
    const key = k.startsWith('--') ? `"${k}"` : k;
    return `${key}: ${JSON.stringify(v)}`;
  });
  // Cast to React.CSSProperties to allow CSS custom properties (--i) etc.
  return `{ ${entries.join(', ')} } as React.CSSProperties`;
}

const NUMERIC_ATTRS = new Set([
  'tabindex', 'colspan', 'rowspan', 'maxlength', 'minlength', 'size',
  'rows', 'cols', 'span',
  'aria-valuenow', 'aria-valuemax', 'aria-valuemin', 'aria-level',
  'aria-rowcount', 'aria-colcount', 'aria-posinset', 'aria-setsize',
]);

function transformAttrs(tag, attrs) {
  // attrs is a list of [name, value]
  return attrs
    .map(([name, value]) => {
      const lower = name.toLowerCase();
      if (lower === 'style' && value) {
        const obj = inlineStyleToObject(value);
        return `style={${formatStyleObject(obj)}}`;
      }
      // Rename known attrs
      const newName = ATTR_RENAMES[lower] ?? name;
      // Boolean attrs: hidden, disabled, checked, etc — keep as-is for now
      if (value === undefined) return newName;
      // Numeric attrs need JSX expression syntax {N} not string "N"
      if (NUMERIC_ATTRS.has(lower) && /^-?\d+$/.test(value)) {
        return `${newName}={${value}}`;
      }
      // Escape any { or } in value
      const safe = value.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
      return `${newName}="${safe}"`;
    })
    .join(' ');
}

const ATTR_REGEX = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`<>=]+)))?/g;

function parseAttributes(attrString) {
  const attrs = [];
  let m;
  while ((m = ATTR_REGEX.exec(attrString))) {
    const name = m[1];
    const value = m[2] ?? m[3] ?? m[4];
    attrs.push([name, value]);
  }
  return attrs;
}

function htmlToJsx(html) {
  // 1. Strip <script> blocks entirely (TODO comments could be added)
  html = html.replace(/<script[\s\S]*?<\/script>/g, '');

  // 2. Convert HTML comments to JSX comments
  html = html.replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}');

  // 3. Transform tags. Detect self-closing /> even when attrs are greedy by
  //    stripping a trailing /\s*$ from the captured attrString.
  html = html.replace(/<(\/?)([\w-]+)((?:\s[^>]*)?)>/g, (match, slash, tag, attrString) => {
    if (slash) return `</${tag}>`;
    let selfClose = false;
    if (attrString.match(/\/\s*$/)) {
      selfClose = true;
      attrString = attrString.replace(/\/\s*$/, '');
    }
    const attrs = parseAttributes(attrString);
    const transformed = transformAttrs(tag, attrs);
    const isVoid = VOID_TAGS.has(tag.toLowerCase());
    const closing = isVoid || selfClose ? ' />' : '>';
    return `<${tag}${transformed ? ' ' + transformed : ''}${closing}`;
  });

  // 4. HTML entities → JS-friendly
  html = html
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&middot;/g, '·')
    .replace(/&hellip;/g, '…')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&times;/g, '×')
    .replace(/&check;/g, '✓');

  return html.trim();
}

function generateComponent(pageMeta, bodyJsx) {
  const noLayout = pageMeta.html === 'landing.html' || pageMeta.html === 'design-system.html';
  return `/**
 * Auto-migrated from Open Design HTML artifact \`${pageMeta.html}\`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: ${JSON.stringify(pageMeta.title)} };

export default function ${pageMeta.name}() {
  return (
    <>
${bodyJsx
  .split('\n')
  .map((l) => '      ' + l)
  .join('\n')}
    </>
  );
}
`;
}

function writeOutput(pageMeta, component) {
  const outPath = join(ROOT, 'src/app', pageMeta.route);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, component);
  console.log(`✓ ${pageMeta.route}  (${component.length}b)`);
}

function dedupeAndAppendCss(newCss, allSeen) {
  // Split into rules and dedupe by full rule text
  const lines = newCss.split('\n');
  let out = '';
  let buffer = '';
  let depth = 0;
  for (const line of lines) {
    buffer += line + '\n';
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    if (depth === 0 && buffer.trim()) {
      const key = buffer.replace(/\s+/g, ' ').trim();
      if (!allSeen.has(key)) {
        allSeen.add(key);
        out += buffer;
      }
      buffer = '';
    }
  }
  return out;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

async function main() {
  // Reset migrated-pages.css
  writeFileSync(STYLES_OUT, '/* ════════════════════════════════════════════════════\n   Auto-generated by scripts/migrate-from-od.mjs\n   Page-specific styles deduped across all migrated pages.\n   ═══════════════════════════════════════════════════════ */\n\n');

  const seenCss = new Set();
  let failed = [];

  for (const page of PAGES) {
    try {
      const html = await fetchPage(page.html);
      const css = extractStyle(html);
      const body = extractBody(html);
      const jsx = htmlToJsx(body);
      const component = generateComponent(page, jsx);

      writeOutput(page, component);

      const deduped = dedupeAndAppendCss(css, seenCss);
      if (deduped.trim()) {
        appendFileSync(STYLES_OUT, `\n/* ─── ${page.html} ─────────────────────────── */\n${deduped}\n`);
      }
    } catch (err) {
      console.error(`✗ ${page.html}:`, err.message);
      failed.push(page.html);
    }
  }

  console.log(`\n→ ${PAGES.length - failed.length}/${PAGES.length} pages migrées`);
  console.log(`→ Styles uniques dans ${STYLES_OUT}`);
  if (failed.length) console.log('✗ Failed:', failed.join(', '));
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
