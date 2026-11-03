import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('home page renders with brand identity and hero content', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/BidMarket/);
    await expect(page.getByLabel('BidMarket Home')).toBeVisible();
    await expect(page.getByRole('heading', { name: /where requests meet offers/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /browse marketplace/i })).toBeVisible();
  });

  test('header navigation works to browse listings', async ({ page }) => {
    await page.goto('/');

    const browseLink = page.getByRole('link', { name: 'Browse', exact: true });
    await expect(browseLink).toBeVisible();
    await browseLink.click();

    await expect(page).toHaveURL(/\/listings/);
    await expect(page.getByRole('heading', { name: /marketplace listings/i })).toBeVisible();
  });

  test('login page displays validation errors when submitted empty', async ({ page }) => {
    await page.goto('/login');

    await expect(page).toHaveTitle(/Sign In/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

    const submitBtn = page.getByRole('button', { name: /sign in/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    await expect(page.getByText(/invalid email address/i)).toBeVisible();
    await expect(page.getByText(/expected string to have >=1 characters/i)).toBeVisible();
  });

  test('browse listings page renders search and filter controls', async ({ page }) => {
    await page.goto('/listings');

    await expect(page.getByRole('heading', { name: /marketplace listings/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Requests' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Offers' })).toBeVisible();
  });
});
