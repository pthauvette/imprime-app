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
  test('landing page loads avec le hero + CTA commande', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Plio/);
    // Hero principal (le H1 réel — « Imprime ce que tu veux » n'est que le <title>)
    await expect(page.getByRole('heading', { name: /Imprime tes cartes/i })).toBeVisible();
    // CTA principal vers le wizard de commande
    await expect(page.getByRole('link', { name: /Démarrer une commande|Commencer ma commande/i }).first()).toBeVisible();
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

test.describe('Wizard fusionné — produit virtuel cartes (#303/#304/#305)', () => {
  test('produit virtuel cartes : papier × finition résout le bon productId', async ({ page }) => {
    await page.goto('/order/cards');
    await expect(page.getByRole('heading', { name: 'Papier', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Finition', exact: true })).toBeVisible();

    // 16pt expose une finition « Soft touch » (absente du 14pt par défaut) →
    // prouve que l'axe finition est bien dépendant du papier.
    await page.getByRole('button', { name: /^16pt/ }).click();
    await expect(page.getByRole('tab', { name: /Soft touch/i })).toBeVisible();

    // 16pt + UV haute brillance → doit résoudre productId 16 (mapping curé).
    await page.getByRole('tab', { name: /UV haute brillance/i }).click();
    await page.getByRole('button', { name: /Configurer ma carte/i }).click();
    await expect(page).toHaveURL(/\/order\/configure\?productId=16(?:\b|&|$)/);
  });

  test('ancienne route /order/quantity redirige vers /order/configure (fusion #303)', async ({ page }) => {
    await page.goto('/order/quantity?productId=7&options=4');
    await expect(page).toHaveURL(/\/order\/configure/);
  });

  test('la tuile « Cartes de visite » du start ouvre le produit virtuel', async ({ page }) => {
    await page.goto('/order/start');
    const cardsTile = page.locator('a[href="/order/cards"]');
    await expect(cardsTile).toBeVisible({ timeout: 15_000 });
    await cardsTile.click();
    await expect(page).toHaveURL(/\/order\/cards/);
    await expect(page.getByRole('heading', { name: 'Papier', exact: true })).toBeVisible();
  });
});
