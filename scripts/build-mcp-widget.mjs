#!/usr/bin/env node
/**
 * Génère le HTML du widget MCP « configurateur » avec le bundle navigateur
 * @modelcontextprotocol/ext-apps INLINÉ.
 *
 * Pourquoi inliner : l'iframe sandboxée du host (Claude/ChatGPT) applique une CSP
 * block-all par défaut → un `<script src="cdn…">` est bloqué et le widget rend
 * blanc. Le bundle DOIT donc être embarqué dans le HTML.
 *
 * Pourquoi committer le résultat (vs lire à la build) : sur Amplify/Lambda, lire un
 * fichier de node_modules au runtime n'est pas garanti (tracing). On fige le HTML
 * dans un .generated.ts importé normalement → zéro I/O fichier au runtime.
 *
 * Régénérer après une MAJ de ext-apps OU une édition de configurator.html :
 *   node scripts/build-mcp-widget.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 1) Bundle navigateur ext-apps → expose globalThis.ExtApps (l'iframe n'a pas d'ESM import).
const bundleSrc = readFileSync(require.resolve('@modelcontextprotocol/ext-apps/app-with-deps'), 'utf8');
const bundle = bundleSrc.replace(/export\{([^}]+)\};?\s*$/, (_m, body) =>
  'globalThis.ExtApps={' +
  body.split(',').map((p) => {
    const [local, exported] = p.split(' as ').map((s) => s.trim());
    return `${exported ?? local}:${local}`;
  }).join(',') + '};');
if (bundle === bundleSrc) {
  console.error('ERREUR : export{…} final introuvable dans app-with-deps.js — transform non appliquée.');
  process.exit(1);
}

// 2) Inline dans le HTML du widget (function replacement → pas d'interprétation des $ du bundle).
const widgetPath = resolve(root, 'src/lib/mcp/widget/configurator.html');
const widget = readFileSync(widgetPath, 'utf8');
if (!widget.includes('/*__EXT_APPS_BUNDLE__*/')) {
  console.error('ERREUR : placeholder /*__EXT_APPS_BUNDLE__*/ absent de configurator.html.');
  process.exit(1);
}
const html = widget.replace('/*__EXT_APPS_BUNDLE__*/', () => bundle);

// 3) Écrit le .generated.ts (string TS échappée via JSON.stringify).
const out =
  '// AUTO-GÉNÉRÉ par scripts/build-mcp-widget.mjs — NE PAS ÉDITER À LA MAIN.\n' +
  '// Régénérer : node scripts/build-mcp-widget.mjs (après MAJ ext-apps ou du widget).\n' +
  '/* eslint-disable */\n' +
  `export const CONFIGURATOR_HTML = ${JSON.stringify(html)};\n`;
writeFileSync(resolve(root, 'src/lib/mcp/widget/configurator-html.generated.ts'), out);
console.log(`OK — configurator-html.generated.ts écrit (${html.length} octets, bundle ${bundle.length}).`);
