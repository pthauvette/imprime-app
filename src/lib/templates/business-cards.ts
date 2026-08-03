/**
 * Templates "carte de visite" — 3.5"x2" avec 1/8" de bleed = 95.25mm x 57.15mm.
 *
 * Toutes les positions sont en mm depuis le coin haut-gauche du bleed box.
 * Safe area : retrait de 4mm minimum depuis le trim (3.175mm + 0.825mm).
 *
 * Pour rester safe-zone-compatible :
 *   - x ∈ [7mm, 88.25mm]   (~81mm de largeur utile)
 *   - y ∈ [7mm, 50.15mm]   (~43mm de hauteur utile)
 */

import type { AppTemplate } from './types';

const BLEED_W = 95.25;
const BLEED_H = 57.15;
const COMMON_BASEPDF = {
  width: BLEED_W,
  height: BLEED_H,
  padding: [0, 0, 0, 0] as [number, number, number, number],
};

// ─── Template 1 : Minimal noir & blanc ────────────────────────────────────

export const BC_MINIMAL_BW: AppTemplate = {
  slug: 'bc-minimal-bw',
  name: 'Minimal — noir & blanc',
  description: 'Carte sobre, typographie généreuse. Pour designers, architectes, avocats.',
  productType: 'BUSINESS_CARD',
  variant: '3.5x2',
  side: 'FRONT',
  tags: ['minimal', 'noir', 'sobre', 'pro'],
  accentColor: '#1a1a1a',
  sampleValues: {
    name: 'Sophie Beauchamp',
    title: 'Directrice créative',
    company: 'Boréal Studio',
    email: 'sophie@boreal.studio',
    phone: '+1 514 555 0123',
  },
  defaultSinalite: { productId: 1 },
  pdfme: {
    basePdf: COMMON_BASEPDF,
    schemas: [[
      {
        name: 'name',
        type: 'text',
        position: { x: 7, y: 10 },
        width: 81, height: 9,
        fontSize: 16, fontColor: '#1a1a1a',
        alignment: 'left',
      },
      {
        name: 'title',
        type: 'text',
        position: { x: 7, y: 20 },
        width: 81, height: 5,
        fontSize: 9, fontColor: '#555555',
        alignment: 'left',
      },
      {
        name: 'company',
        type: 'text',
        position: { x: 7, y: 25 },
        width: 81, height: 5,
        fontSize: 9, fontColor: '#888888',
        alignment: 'left',
      },
      // Hairline divider
      {
        name: '_divider',
        type: 'line',
        position: { x: 7, y: 36 },
        width: 24, height: 0.2,
        color: '#1a1a1a',
        readOnly: true,
      },
      {
        name: 'email',
        type: 'text',
        position: { x: 7, y: 39 },
        width: 81, height: 4,
        fontSize: 8, fontColor: '#333333',
        alignment: 'left',
      },
      {
        name: 'phone',
        type: 'text',
        position: { x: 7, y: 44 },
        width: 81, height: 4,
        fontSize: 8, fontColor: '#333333',
        alignment: 'left',
      },
    ]],
  },
};

// ─── Template 2 : Bloc de couleur accent ──────────────────────────────────

export const BC_ACCENT_BLOCK: AppTemplate = {
  slug: 'bc-accent-block',
  name: 'Bloc accent — vert forêt',
  description: 'Bande verticale colorée à gauche, infos à droite. Confiance + énergie.',
  productType: 'BUSINESS_CARD',
  variant: '3.5x2',
  side: 'FRONT',
  tags: ['couleur', 'audacieux', 'moderne'],
  accentColor: '#234d3a',
  sampleValues: {
    name: 'Maxime Roy',
    title: 'Fondateur',
    company: 'Agence Boréal',
    email: 'maxime@agenceboreal.ca',
    phone: '+1 438 555 7890',
    web: 'agenceboreal.ca',
  },
  defaultSinalite: { productId: 1 },
  pdfme: {
    basePdf: COMMON_BASEPDF,
    schemas: [[
      // Color block left
      {
        name: '_block',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 22, height: BLEED_H,
        color: '#234d3a',
        readOnly: true,
        borderColor: '#234d3a',
        borderWidth: 0,
      },
      {
        name: 'name',
        type: 'text',
        position: { x: 28, y: 14 },
        width: 65, height: 8,
        fontSize: 14, fontColor: '#1a1a1a',
        alignment: 'left',
      },
      {
        name: 'title',
        type: 'text',
        position: { x: 28, y: 22 },
        width: 65, height: 5,
        fontSize: 9, fontColor: '#234d3a',
        alignment: 'left',
      },
      {
        name: 'company',
        type: 'text',
        position: { x: 28, y: 32 },
        width: 65, height: 4,
        fontSize: 8, fontColor: '#666666',
        alignment: 'left',
      },
      {
        name: 'email',
        type: 'text',
        position: { x: 28, y: 40 },
        width: 65, height: 4,
        fontSize: 7.5, fontColor: '#333333',
        alignment: 'left',
      },
      {
        name: 'phone',
        type: 'text',
        position: { x: 28, y: 44 },
        width: 65, height: 4,
        fontSize: 7.5, fontColor: '#333333',
        alignment: 'left',
      },
      {
        name: 'web',
        type: 'text',
        position: { x: 28, y: 48 },
        width: 65, height: 4,
        fontSize: 7.5, fontColor: '#333333',
        alignment: 'left',
      },
    ]],
  },
};

// ─── Template 3 : Editorial serif ─────────────────────────────────────────

export const BC_EDITORIAL: AppTemplate = {
  slug: 'bc-editorial',
  name: 'Editorial — serif',
  description: 'Nom en serif italique large. Romantique, pour créateurs et artisans.',
  productType: 'BUSINESS_CARD',
  variant: '3.5x2',
  side: 'FRONT',
  tags: ['serif', 'editorial', 'créateur', 'élégant'],
  accentColor: '#3d2818',
  sampleValues: {
    name: 'Marguerite Dubois',
    title: 'Céramiste',
    studio: 'Atelier Verre & Terre',
    email: 'hello@margueritedubois.com',
    phone: '+1 514 555 4422',
  },
  defaultSinalite: { productId: 1 },
  pdfme: {
    basePdf: COMMON_BASEPDF,
    schemas: [[
      {
        name: 'name',
        type: 'text',
        position: { x: 7, y: 16 },
        width: 81, height: 10,
        fontSize: 19, fontColor: '#3d2818',
        alignment: 'left',
        // pdfme uses italic via font style — fallback to default for MVP
      },
      {
        name: 'title',
        type: 'text',
        position: { x: 7, y: 28 },
        width: 81, height: 4,
        fontSize: 8, fontColor: '#7a5a3a',
        alignment: 'left',
        characterSpacing: 1.5,
      },
      {
        name: 'studio',
        type: 'text',
        position: { x: 7, y: 34 },
        width: 81, height: 4,
        fontSize: 8, fontColor: '#a08070',
        alignment: 'left',
      },
      {
        name: 'email',
        type: 'text',
        position: { x: 7, y: 44 },
        width: 81, height: 3.5,
        fontSize: 7, fontColor: '#3d2818',
        alignment: 'left',
      },
      {
        name: 'phone',
        type: 'text',
        position: { x: 7, y: 48 },
        width: 81, height: 3.5,
        fontSize: 7, fontColor: '#3d2818',
        alignment: 'left',
      },
    ]],
  },
};
