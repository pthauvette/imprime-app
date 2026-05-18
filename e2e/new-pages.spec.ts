/**
 * E2E pour les pages ajoutées dans Rounds 6-10 :
 *   - /track (public order tracking — PR #2)
 *   - /status (health public — Round 5)
 *   - Cookie consent banner (Round 5)
 *   - /admin/* protection (redirect si pas admin)
 *
 * Smoke-level : on vérifie que les pages render + actions de base
 * marchent. Tests de logic complexe restent côté unit (vitest).
 */

import { test, expect } from '@playwright/test';

test.describe('/track public order tracking', () => {
  test('renders form + nav + bouton submit', async ({ page }) => {
    await page.goto('/track');
    await expect(page.getByRole('heading', { name: /Où est ma commande/i })).toBeVisible();
    // Form fields visibles
    await expect(page.getByPlaceholder(/SIN-/i)).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Suivre ma commande/i })).toBeVisible();
  });

  test('submit avec credentials random → erreur 404 friendly', async ({ page }) => {
    await page.goto('/track');
    await page.getByPlaceholder(/SIN-/i).fill('SIN-99999');
    await page.getByPlaceholder(/email/i).fill('random@nobody.ca');
    await page.getByRole('button', { name: /Suivre ma commande/i }).click();

    // L'API doit retourner 404 (générique pour éviter le leak) → error block
    await expect(page.locator('body')).toContainText(/Aucune commande trouvée/i);
  });

  test('breadcrumb JSON-LD présent (SEO)', async ({ page }) => {
    await page.goto('/track');
    const jsonld = page.locator('script[type="application/ld+json"]');
    await expect(jsonld.first()).toBeAttached();
  });
});

test.describe('/status health page publique', () => {
  test('affiche le badge global + checks individuels', async ({ page }) => {
    await page.goto('/status');
    // Au moins un check visible (DB, Stripe, SES, etc.)
    await expect(page.locator('body')).toContainText(/database|db/i);
    // Pas de stack trace ou JSON brut leaked
    await expect(page.locator('body')).not.toContainText(/at \w+\.\w+ \(/); // no stacks
  });
});

test.describe('Cookie consent banner', () => {
  test('apparaît après ~1.5s au 1er visit + dismiss → cookie set', async ({ page, context }) => {
    // Clear cookies pour simuler 1er visit
    await context.clearCookies();
    await page.goto('/');

    // Wait pour le delay 1.5s qui évite de spammer au paint
    const banner = page.getByRole('region', { name: /cookies/i });
    await expect(banner).toBeVisible({ timeout: 5000 });

    // Click "OK, compris"
    await page.getByRole('button', { name: /OK, compris/i }).click();

    // Banner disparaît
    await expect(banner).not.toBeVisible();

    // Cookie set
    const cookies = await context.cookies();
    const consent = cookies.find((c) => c.name === 'plio_consent');
    expect(consent?.value).toBe('ok');
  });

  test('si plio_consent cookie déjà set, banner ne s\'affiche pas', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'plio_consent',
        value: 'ok',
        domain: new URL(page.url() || 'http://localhost:3000').hostname,
        path: '/',
      },
    ]);
    await page.goto('/');
    // Attente plus que le delay 1.5s pour être sûr
    await page.waitForTimeout(2000);
    await expect(page.getByRole('region', { name: /cookies/i })).not.toBeVisible();
  });
});

test.describe('Admin route protection', () => {
  test('GET /admin sans session → redirect /sign-in', async ({ page }) => {
    const response = await page.goto('/admin');
    // Soit redirect (status 200 sur /sign-in) soit /sign-in dans l'URL
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toMatch(/sign-in/);
    // Status final peut être 200 sur la sign-in page
    expect(response?.status() ?? 0).toBeLessThan(500);
  });

  for (const path of [
    '/admin/experiments',
    '/admin/nps',
    '/admin/crons',
    '/admin/email-preview',
  ]) {
    test(`GET ${path} sans session → redirect`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toMatch(/sign-in/);
    });
  }
});
