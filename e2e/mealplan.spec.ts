import { expect, test } from '@playwright/test';

const BASE = 'http://localhost:3010';

// Tests in this file are order-dependent (they walk a plan through its
// lifecycle); playwright.config.ts runs them serially with one worker.

async function mcpCall(method: string, params: unknown, id: number): Promise<void> {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  expect(res.ok).toBe(true);
  const text = await res.text();
  expect(text).not.toContain('"isError":true');
}

test.beforeAll(async () => {
  // First push lands as the active plan (empty database).
  await mcpCall(
    'tools/call',
    {
      name: 'push_meal_plan',
      arguments: {
        meals: [
          {
            mealType: 'dinner',
            recipe: {
              title: 'E2E Roast Chicken',
              description: 'A chicken for the robots.',
              servings: 4,
              prepMinutes: 15,
              cookMinutes: 75,
              tags: ['e2e'],
              stepsMarkdown: '1. Preheat the oven.\n2. Roast the chicken.\n3. Rest and carve.',
              ingredients: [
                { name: 'whole chicken', quantity: 4, unit: 'lb', section: 'meat-seafood' },
                { name: 'carrots', quantity: 4, unit: null, section: 'produce' },
              ],
            },
          },
          {
            mealType: 'breakfast',
            recipe: {
              title: 'E2E Overnight Oats',
              description: 'Breakfast, but automated.',
              servings: 2,
              prepMinutes: 5,
              cookMinutes: null,
              tags: ['e2e'],
              stepsMarkdown: '1. Stir oats and milk.\n2. Chill overnight.',
              ingredients: [
                { name: 'rolled oats', quantity: 2, unit: 'cup', section: 'pantry' },
                { name: 'milk', quantity: 1.5, unit: 'cup', section: 'dairy-eggs' },
              ],
            },
          },
        ],
      },
    },
    1,
  );
  // Second push queues as upcoming.
  await mcpCall(
    'tools/call',
    {
      name: 'push_meal_plan',
      arguments: {
        name: 'E2E Taco Week',
        meals: [
          {
            mealType: 'dinner',
            recipe: {
              title: 'E2E Tacos',
              description: 'Planned ahead, like a real household.',
              servings: 4,
              prepMinutes: 10,
              cookMinutes: 25,
              tags: ['e2e'],
              stepsMarkdown: '1. Brown the beef.\n2. Assemble the tacos.',
              ingredients: [
                { name: 'ground beef', quantity: 1, unit: 'lb', section: 'meat-seafood' },
                { name: 'taco shells', quantity: 12, unit: null, section: 'pantry' },
              ],
            },
          },
        ],
      },
    },
    2,
  );
});

test('active plan shows meals grouped by meal type', async ({ page }) => {
  await page.goto('/');
  // "/" redirects to the plans section, which defaults to the active plan
  await expect(page).toHaveURL(/\/plans/);
  await expect(page.getByRole('heading', { name: 'Breakfast' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dinner' })).toBeVisible();
  await expect(page.getByText('E2E Roast Chicken')).toBeVisible();
  await expect(page.getByText('E2E Overnight Oats')).toBeVisible();
  // the unnamed first plan gets a default display name
  await expect(page.getByText('Meal Plan 1')).toBeVisible();
});

test('recipe detail and cook mode', async ({ page }) => {
  await page.goto('/plans');
  await page.getByText('E2E Roast Chicken').click();
  await page.getByText('Open recipe').click();

  await expect(page.getByText('whole chicken')).toBeVisible();
  await expect(page.getByText('4 lb')).toBeVisible();
  await expect(page.getByText('Preheat the oven.')).toBeVisible();

  await page.getByText('Start cooking').click();
  const cook = page.locator('div.fixed');
  await expect(cook.getByText('/ 3')).toBeVisible();
  await expect(cook.getByText('Preheat the oven.')).toBeVisible();
  await cook.getByRole('button', { name: 'Next step' }).click();
  await expect(cook.getByText('Roast the chicken.')).toBeVisible();
  await cook.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByRole('button', { name: 'Done — serve it' })).toBeVisible();
  await page.getByRole('button', { name: 'Done — serve it' }).click();
  await expect(page.getByText('Start cooking')).toBeVisible();
});

test('grocery list builds from the active plan and check-off persists', async ({ page }) => {
  await page.goto('/grocery');
  await expect(page.getByText('Meal Plan 1')).toBeVisible();
  await expect(page.getByText('carrots')).toBeVisible();

  await page.getByRole('button', { name: /carrots/ }).click();
  await expect(page.getByRole('heading', { name: 'In the cart' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'In the cart' })).toBeVisible();
  const cart = page.locator('section', { has: page.getByRole('heading', { name: 'In the cart' }) });
  await expect(cart.getByText('carrots')).toBeVisible();
});

test('manual grocery item can be added and removed', async ({ page }) => {
  await page.goto('/grocery');
  await page.getByLabel('Add a grocery item').fill('paper towels');
  await page.getByRole('button', { name: '+', exact: true }).click();
  await expect(page.getByText('paper towels')).toBeVisible();

  await page.getByRole('button', { name: 'Remove paper towels' }).click();
  await expect(page.getByText('paper towels')).not.toBeVisible();
});

test('upcoming tab lists queued plans as cards that open a detail page', async ({ page }) => {
  await page.goto('/plans/upcoming');
  await expect(page.getByText('E2E Taco Week')).toBeVisible();
  await expect(page.getByText('E2E Tacos')).toBeVisible();

  await page.getByLabel('Open E2E Taco Week').click();
  await expect(page.getByText('E2E Taco Week')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make this the active plan' })).toBeVisible();
});

test('activating is blocked while another plan is active', async ({ page }) => {
  await page.goto('/plans/upcoming');
  await page.getByLabel('Open E2E Taco Week').click();
  await page.getByRole('button', { name: 'Make this the active plan' }).click();
  await expect(page.getByRole('alert')).toContainText('already active');
});

test('favoriting a plan requires a name; naming unlocks it', async ({ page }) => {
  await page.goto('/plans');
  await page.getByLabel('Save plan to favorites').click();
  await expect(page.getByRole('alert')).toContainText('Name this plan');

  await page.getByLabel('Plan name').fill('E2E Chicken Week');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('E2E Chicken Week')).toBeVisible();

  await page.getByLabel('Save plan to favorites').click();
  await expect(page.getByLabel('Remove plan from favorites')).toBeVisible();

  await page.goto('/plans/favorites');
  await expect(page.getByText('E2E Chicken Week')).toBeVisible();
});

test('completing the active plan frees the slot for an upcoming one', async ({ page }) => {
  await page.goto('/plans');
  await page.getByRole('button', { name: 'Complete this plan' }).click();

  await expect(page.getByText('No active meal plan')).toBeVisible();
  await expect(page.getByText('E2E Taco Week')).toBeVisible();

  await page.getByRole('button', { name: 'Set active' }).click();
  await expect(page.getByRole('button', { name: 'Complete this plan' })).toBeVisible();
  await expect(page.getByText('E2E Tacos')).toBeVisible();

  await page.goto('/plans/completed');
  await expect(page.getByText('E2E Chicken Week')).toBeVisible();
});

test('favoriting a recipe shows it in favorites', async ({ page }) => {
  await page.goto('/recipes');
  await expect(page.getByText('No favorites yet')).toBeVisible();

  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('E2E Overnight Oats')).toBeVisible();
  await page
    .locator('article', { hasText: 'E2E Overnight Oats' })
    .getByLabel('Save to favorites')
    .click();

  await page.getByRole('tab', { name: /Favorites/ }).click();
  await expect(page.getByText('E2E Overnight Oats')).toBeVisible();
});

test('recipes can be filtered by meal type', async ({ page }) => {
  await page.goto('/recipes');
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('E2E Roast Chicken')).toBeVisible();

  await page.getByRole('button', { name: 'Breakfast' }).click();
  await expect(page.getByText('E2E Overnight Oats')).toBeVisible();
  await expect(page.getByText('E2E Roast Chicken')).not.toBeVisible();
});
