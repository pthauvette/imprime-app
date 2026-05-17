/**
 * Smoke tests — pages publiques rendent + interactions basiques marchent.
 *
 * Complète .github/workflows/smoke-prod.yml (qui fait juste curl status +
 * grep pattern). Ici on monte un vrai browser → catch les bugs JS, CSS
 * cassé, layout shift, scroll bloqué, etc.
 *
 * Run :
 *   pnpm exec playwright test e2e/smoke.spec.ts
 *   E2E_BASE_URL=https://www.plio.ca pnpm exec playwright test e2e/smoke.spec.ts
 */

import { test, expect } from '@playwright/test';

test.describe('Public pages render', () => {
  test('landing page loads avec le hero "Imprime ce que tu veux"', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Plio/);
    // Hero principal
    await expect(page.getByRole('heading', { name: /Imprime ce que tu veux/i })).toBeVisible();
    // CTA principal
    await expect(page.getByRole('link', { name: /Démarrer un devis/i }).first()).toBeVisible();
  });

  test('pricing page affiche les tiers', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('body')).toContainText(/tarif/i);
  });

  test('contact page affiche le formulaire avec champs', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByLabel(/Nom complet/i)).toBeVisible();
    await expect(page.getByLabel(/Courriel/i)).toBeVisible();
    await expect(page.getByLabel(/Sujet/i)).toBeVisible();
    await expect(page.getByLabel(/Message/i)).toBeVisible();
  });

  test('legal pages contiennent les compliance markers', async ({ page }) => {
    await page.goto('/legal/privacy');
    await expect(page.locator('body')).toContainText(/Loi 25/);
    await expect(page.locator('body')).toContainText(/LPRPDE/);

    await page.goto('/legal/terms');
    await expect(page.locator('body')).toContainText(/Plio/);

    await page.goto('/legal/refund-policy');
    await expect(page.locator('body')).toContainText(/emboursement/);
  });

  test('sign-in page rend le formulaire magic link', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.locator('body')).toContainText(/lien magique|magic link/i);
  });
});

test.describe('Scroll behavior (regression : overflow:hidden bug)', () => {
  test('landing page peut scroller au-delà du viewport', async ({ page }) => {
    await page.goto('/');
    // Mesure scrollY initial
    const initialY = await page.evaluate(() => window.scrollY);
    expect(initialY).toBe(0);

    // Scroll vers le footer
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(200); // laisse le scroll s'appliquer

    const newY = await page.evaluate(() => window.scrollY);
    expect(newY).toBeGreaterThan(500); // a vraiment scrollé

    // Le footer doit être atteignable
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);

    // Vérifie les liens légaux du footer apparaissent (= scroll a marché jusqu'au bout)
    await expect(page.getByRole('link', { name: /Politique de confidentialité/i }).first()).toBeVisible();
  });

  test('html/body n\'ont PAS overflow:hidden en global', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => ({
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      scrollHeight: document.body.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    // Si overflow:hidden réapparait par accident, ce test catch immédiatement
    expect(overflow.bodyOverflow).not.toBe('hidden');
    expect(overflow.htmlOverflow).not.toBe('hidden');
    // Et la page DOIT avoir du contenu scrollable
    expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
  });
});

test.describe('SEO + accessibility basics', () => {
  test('landing a meta description', async ({ page }) => {
    await page.goto('/');
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(50);
  });

  test('toutes les pages publiques retournent 200 (pas de 404)', async ({ page }) => {
    const paths = ['/', '/pricing', '/templates', '/about', '/contact', '/sign-in', '/legal/privacy', '/legal/terms', '/legal/refund-policy'];
    for (const path of paths) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} should be 200`).toBe(200);
    }
  });
});
