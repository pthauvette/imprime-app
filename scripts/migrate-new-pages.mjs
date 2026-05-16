#!/usr/bin/env node
/**
 * Migration des 23 nouvelles pages Open Design (admin + onboarding + marketing + legal).
 *
 * Different from migrate-from-od.mjs :
 *   - Reads files directly from disk (no OD daemon dependency)
 *   - Targets NEW pages only (n'écrase pas les 28 originales déjà customisées)
 *   - Emails sont copiés en raw HTML vers src/lib/emails/templates/ (pas de JSX —
 *     ils sont rendered par nodemailer/SES avec substitution {{VAR}})
 *
 * Cleanup manuel attendu après pour :
 *   - Wire Server Component data fetching (DB queries pour admin)
 *   - Wire client interactivity (filters, bulk actions, drawers)
 *   - Auth guards via middleware pour /admin/*
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OD_DIR = '/Users/assnat/open-design/.od/projects/imprime';
const STYLES_OUT = join(ROOT, 'src/styles/migrated-pages.css');

// ─── NEW pages to migrate (excludes emails, design-editor) ────────────────

const PAGES = [
  // Admin portal — full /admin/* prefix
  { html: 'admin-dashboard.html',       route: 'admin/page.tsx',                       name: 'AdminDashboard',         title: 'Admin — Tableau de bord' },
  { html: 'admin-orders.html',          route: 'admin/orders/page.tsx',                name: 'AdminOrders',            title: 'Admin — Commandes' },
  { html: 'admin-order-detail.html',    route: 'admin/orders/[id]/page.tsx',           name: 'AdminOrderDetail',       title: 'Admin — Détail commande' },
  { html: 'admin-users.html',           route: 'admin/users/page.tsx',                 name: 'AdminUsers',             title: 'Admin — Utilisateurs' },
  { html: 'admin-user-detail.html',     route: 'admin/users/[id]/page.tsx',            name: 'AdminUserDetail',        title: 'Admin — Détail utilisateur' },
  { html: 'admin-templates.html',       route: 'admin/templates/page.tsx',             name: 'AdminTemplates',         title: 'Admin — Templates' },
  { html: 'admin-template-editor.html', route: 'admin/templates/[slug]/edit/page.tsx', name: 'AdminTemplateEditor',    title: 'Admin — Éditeur template' },
  { html: 'admin-products.html',        route: 'admin/products/page.tsx',              name: 'AdminProducts',          title: 'Admin — Catalogue Sinalite' },
  { html: 'admin-finances.html',        route: 'admin/finances/page.tsx',              name: 'AdminFinances',          title: 'Admin — Finances' },
  { html: 'admin-webhooks.html',        route: 'admin/webhooks/page.tsx',              name: 'AdminWebhooks',          title: 'Admin — Webhooks' },

  // Consumer polish
  { html: 'onboarding.html',            route: 'onboarding/page.tsx',                  name: 'OnboardingPage',         title: 'Bienvenue — Imprime' },

  // Marketing + legal
  { html: 'about.html',                 route: 'about/page.tsx',                       name: 'AboutPage',              title: "L'histoire d'Imprime" },
  { html: 'contact.html',               route: 'contact/page.tsx',                     name: 'ContactPage',            title: 'Parle-nous — Imprime' },
  { html: 'terms.html',                 route: 'legal/terms/page.tsx',                 name: 'TermsPage',              title: "Conditions d'utilisation — Imprime" },
  { html: 'privacy.html',               route: 'legal/privacy/page.tsx',               name: 'PrivacyPage',            title: 'Confidentialité — Imprime' },
  { html: 'refund-policy.html',         route: 'legal/refund-policy/page.tsx',         name: 'RefundPolicyPage',       title: 'Remboursement — Imprime' },
];

// Emails — copied raw to src/lib/emails/templates/
const EMAILS = [
  'email-magic-link.html',
  'email-order-confirmation.html',
  'email-order-shipped.html',
  'email-order-delivered.html',
  'email-order-cancelled.html',
  'email-refund-issued.html',
];

// ─── HELPERS (same as migrate-from-od.mjs, plus disk read) ────────────────

function readPage(name) {
  return readFileSync(join(OD_DIR, name), 'utf-8');
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
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
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
  stopcolor: 'stopColor',
  stopopacity: 'stopOpacity',
  fillopacity: 'fillOpacity',
  strokeopacity: 'strokeOpacity',
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
  return `{ ${entries.join(', ')} } as React.CSSProperties`;
}

const NUMERIC_ATTRS = new Set([
  'tabindex', 'colspan', 'rowspan', 'maxlength', 'minlength', 'size',
  'rows', 'cols', 'span',
  'aria-valuenow', 'aria-valuemax', 'aria-valuemin', 'aria-level',
  'aria-rowcount', 'aria-colcount', 'aria-posinset', 'aria-setsize',
]);

function transformAttrs(tag, attrs) {
  return attrs
    .map(([name, value]) => {
      const lower = name.toLowerCase();
      // Drop inline JS event handlers — useless in Server Components,
      // need 'use client' + proper handler refactor to revive.
      if (lower.startsWith('on') && /^on[a-z]+$/.test(lower)) return null;
      if (lower === 'style' && value) {
        const obj = inlineStyleToObject(value);
        return `style={${formatStyleObject(obj)}}`;
      }
      const newName = ATTR_RENAMES[lower] ?? name;
      if (value === undefined) return newName;
      if (NUMERIC_ATTRS.has(lower) && /^-?\d+$/.test(value)) {
        return `${newName}={${value}}`;
      }
      const safe = value.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
      return `${newName}="${safe}"`;
    })
    .filter(Boolean)
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
  html = html.replace(/<script[\s\S]*?<\/script>/g, '');
  html = html.replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}');

  // JSON snippets inside <pre> or <code> blocks have raw { } that JSX parses
  // as expression delimiters → escape them to &#123; / &#125; before the
  // tag conversion runs.
  html = html.replace(/<(pre|code)([^>]*)>([\s\S]*?)<\/\1>/g, (_m, tag, attrs, body) => {
    const escaped = body.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
    return `<${tag}${attrs}>${escaped}</${tag}>`;
  });
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
  html = html
    .replace(/&nbsp;/g, ' ')
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
  return `/**
 * Auto-migrated from Open Design HTML artifact \`${pageMeta.html}\`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
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

function copyEmail(name) {
  const src = join(OD_DIR, name);
  const destDir = join(ROOT, 'src/lib/emails/templates');
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, name);
  copyFileSync(src, dest);
  console.log(`✓ emails/templates/${name}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

const ROUND2_MARKER = '/* ════════════════════════════════════════════════════\n   Round 2 (admin + onboarding + marketing + legal)';

function main() {
  const seenCss = new Set();
  const failed = [];

  // Truncate any previous Round 2 section so re-runs don't duplicate CSS.
  if (existsSync(STYLES_OUT)) {
    const current = readFileSync(STYLES_OUT, 'utf-8');
    const idx = current.indexOf(ROUND2_MARKER);
    if (idx >= 0) writeFileSync(STYLES_OUT, current.slice(0, idx).trimEnd() + '\n');
  }

  // Append to existing migrated-pages.css (preserve original 28's styles)
  appendFileSync(STYLES_OUT, `\n\n${ROUND2_MARKER}\n   Generated by scripts/migrate-new-pages.mjs · ${new Date().toISOString()}\n   ═══════════════════════════════════════════════════════ */\n`);

  for (const page of PAGES) {
    try {
      const html = readPage(page.html);
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

  console.log('');
  console.log('Copying email templates...');
  for (const email of EMAILS) {
    try {
      copyEmail(email);
    } catch (err) {
      console.error(`✗ ${email}:`, err.message);
      failed.push(email);
    }
  }

  console.log(`\n→ ${PAGES.length + EMAILS.length - failed.length}/${PAGES.length + EMAILS.length} fichiers migrés`);
  if (failed.length) console.log('✗ Failed:', failed.join(', '));
}

main();
