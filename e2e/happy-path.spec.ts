/**
 * Happy-path E2E : full wizard de commande (6 étapes depuis la fusion #303).
 *
 * Couvre :
 *   1. /order/start : category picker (la tuile cartes → /order/cards)
 *   2. /order/product (ou /order/cards pour les cartes) : choisir le produit
 *   3. /order/configure : options + QUANTITÉ (slider) + prix live → upload
 *   4. /order/upload : upload un PDF de test
 *   5. /order/shipping : remplir contact + address
 *   6. /order/review : vérifier le breakdown + payer via Stripe test card
 *
 * Stratégie : on tape contre un serveur dev local (pnpm dev) avec les
 * vraies intégrations en STAGE (Sinalite stage + Stripe test mode + S3
 * dev). Catch les bugs d'intégration sans risquer de vraies charges $.
 *
 * Pré-requis pour run :
 *   - pnpm dev running sur localhost:3000
 *   - Env vars dev : SINALITE_* stage, STRIPE_* test, S3_* dev, etc.
 *   - Aucun login Plio requis (guest checkout supported)
 *
 * Pour tester contre prod (DANGER : crée de vraies commandes) :
 *   E2E_BASE_URL=https://www.plio.ca pnpm exec playwright test happy-path
 */

import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM-compatible __dirname (le package est "type": "module")
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fixtures
const STRIPE_TEST_CARD = '4242 4242 4242 4242';
const STRIPE_TEST_CVC = '123';
const STRIPE_TEST_EXP = '12/30';
const TEST_PDF_PATH = join(__dirname, 'fixtures', 'test-card.pdf');

const RUN_FULL_FLOW = process.env.E2E_FULL_FLOW === '1';

test.describe('Wizard navigation (steps 1-4, no upload/payment)', () => {
  test('step 1 → choose product category', async ({ page }) => {
    await page.goto('/order/start');
    // Au moins une carte produit doit être visible
    const cards = page.locator('a[href*="/order/product"]');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  });

  test('step 1 → 2 → 3 : navigation jusqu\'à configure', async ({ page }) => {
    await page.goto('/order/start');
    // Click la 1ère catégorie (la plus visible)
    const firstCategory = page.locator('a[href*="/order/product"]').first();
    await firstCategory.click();
    await page.waitForURL(/\/order\/product/);

    // Pick le 1er produit
    const firstProduct = page.locator('a[href*="/order/configure"]').first();
    await expect(firstProduct).toBeVisible({ timeout: 15_000 });
    await firstProduct.click();
    await page.waitForURL(/\/order\/configure/);

    // Config FUSIONNÉE (#303) : slider quantité + prix live + bouton vers upload.
    await expect(page.locator('input[type="range"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Sous-total/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Téléverser le design/i })).toBeVisible();
  });

  test('parcours cartes : start → /order/cards → configure (produit virtuel #304)', async ({ page }) => {
    await page.goto('/order/start');
    const cardsTile = page.locator('a[href="/order/cards"]');
    await expect(cardsTile).toBeVisible({ timeout: 15_000 });
    await cardsTile.click();
    await page.waitForURL(/\/order\/cards/);

    // Papier 14pt (défaut) + finition « Mat » (exact) → résout productId 8.
    // (Le rendu de la config fusionnée elle-même — slider + prix Sinalite — est
    // couvert par le test « navigation jusqu'à configure » ci-dessus ; ici on
    // vérifie uniquement le HANDOFF déterministe cartes → bon productId.)
    await page.getByRole('tab', { name: 'Mat', exact: true }).click();
    await page.getByRole('button', { name: /Configurer ma carte/i }).click();
    await expect(page).toHaveURL(/\/order\/configure\?productId=8(?:\b|&|$)/);
  });
});

test.describe('Happy path complet : visit → wizard → paye → confirme', () => {
  test.skip(!RUN_FULL_FLOW, 'Full flow seulement si E2E_FULL_FLOW=1 (crée vraies entries DB)');

  test('full purchase flow', async ({ page }) => {
    // ── Step 1 : Category
    await page.goto('/order/start');
    const firstCategory = page.locator('a[href*="/order/product"]').first();
    await firstCategory.click();

    // ── Step 2 : Product
    await page.waitForURL(/\/order\/product/);
    const firstProduct = page.locator('a[href*="/order/configure"]').first();
    await firstProduct.click();

    // ── Step 3 : Configure (options + quantité fusionnées #303) — accept defaults
    await page.waitForURL(/\/order\/configure/);
    // Le bouton de config va DIRECTEMENT à l'upload : la quantité (slider) + le
    // prix live sont sur ce même écran. Plus d'étape /order/quantity séparée.
    const nextBtn = page.getByRole('button', { name: /Téléverser le design/i });
    await expect(nextBtn).toBeVisible({ timeout: 15_000 });
    await nextBtn.click();

    // ── Step 4 : Upload PDF
    await page.waitForURL(/\/order\/upload/);
    if (!existsSync(TEST_PDF_PATH)) {
      test.skip(true, `Fixture PDF manquante : ${TEST_PDF_PATH}. Run le helper pour la générer.`);
    }
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_PDF_PATH);
    // Attend que l'upload S3 finisse — bouton "Continuer" devient enabled
    await page.waitForTimeout(3_000);
    const uploadNextBtn = page.getByRole('button', { name: /Adresse de livraison/i });
    await uploadNextBtn.click();

    // ── Step 6 : Shipping
    await page.waitForURL(/\/order\/shipping/);
    await page.getByLabel(/Prénom/i).fill('Test');
    await page.getByLabel(/Nom/i).fill('E2E');
    await page.getByLabel(/Courriel/i).fill('e2e-test@plio.ca');
    await page.getByLabel(/Téléphone/i).fill('+15145550144');
    await page.getByLabel(/Adresse/i).fill('4220 boul. Saint-Laurent');
    await page.getByLabel(/Ville/i).fill('Montréal');
    await page.getByLabel(/Province/i).selectOption('QC');
    await page.getByLabel(/Code postal/i).fill('H2W 1Z3');
    await page.getByRole('button', { name: /Continuer|Suivant/i }).click();

    // ── Step 7 : Review + Payment (Stripe Elements dans iframe)
    await page.waitForURL(/\/order\/review/);
    // Attend que Stripe Elements charge
    await page.waitForTimeout(3_000);
    // Stripe card input est dans un iframe — utiliser frameLocator
    const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
    await stripeFrame.locator('input[name="number"]').fill(STRIPE_TEST_CARD);
    await stripeFrame.locator('input[name="expiry"]').fill(STRIPE_TEST_EXP);
    await stripeFrame.locator('input[name="cvc"]').fill(STRIPE_TEST_CVC);

    await page.getByRole('button', { name: /Payer|Confirmer/i }).click();

    // ── Confirmation
    await page.waitForURL(/\/order\/confirmation/, { timeout: 30_000 });
    await expect(page.locator('body')).toContainText(/Production démarre/i);
  });
});

test.describe('PDF invoice download', () => {
  test.skip(!RUN_FULL_FLOW, 'Requires an existing order (full flow run au préalable)');

  test('admin peut télécharger le PDF facture d\'une commande', async ({ page }) => {
    // Stub : ce test nécessite un order ID + admin auth. Skip jusqu'à wire
    // un test fixture qui pré-crée un user admin + un order.
  });
});
