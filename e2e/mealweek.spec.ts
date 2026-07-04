import { expect, test } from '@playwright/test';

const BASE = 'http://localhost:3010';

function weekStart(weeksFromNow = 0): string {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + weeksFromNow * 7);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
  await mcpCall(
    'tools/call',
    {
      name: 'push_meal_plan',
      arguments: {
        weekStart: weekStart(),
        meals: [
          {
            dayOfWeek: 0,
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
            dayOfWeek: 2,
            mealType: 'dinner',
            recipe: {
              title: 'E2E Salmon',
              description: 'Fish, but automated.',
              servings: 4,
              prepMinutes: 10,
              cookMinutes: 20,
              tags: ['e2e'],
              stepsMarkdown: '1. Sear the salmon.\n2. Plate it.',
              ingredients: [
                { name: 'salmon fillets', quantity: 1.5, unit: 'lb', section: 'meat-seafood' },
                { name: 'lemon', quantity: 1, unit: null, section: 'produce' },
              ],
            },
          },
        ],
      },
    },
    1,
  );
  await mcpCall(
    'tools/call',
    {
      name: 'push_meal_plan',
      arguments: {
        weekStart: weekStart(1),
        meals: [
          {
            dayOfWeek: 4,
            mealType: 'dinner',
            recipe: {
              title: 'E2E Next-Week Tacos',
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

test('week view shows the pushed plan', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('E2E Roast Chicken')).toBeVisible();
  await expect(page.getByText('E2E Salmon')).toBeVisible();
  await expect(page.getByText('Mon', { exact: true })).toBeVisible();
  await expect(page.getByText('Wed', { exact: true })).toBeVisible();
});

test('week selector switches between planned weeks', async ({ page }) => {
  await page.goto('/');
  // Current week is the default when it has a plan.
  await expect(page.getByText('E2E Roast Chicken')).toBeVisible();

  await page.getByLabel('Choose a week').selectOption(weekStart(1));
  await expect(page.getByText('E2E Next-Week Tacos')).toBeVisible();
  await expect(page.getByText('E2E Roast Chicken')).not.toBeVisible();

  await page.getByLabel('Choose a week').selectOption(weekStart());
  await expect(page.getByText('E2E Roast Chicken')).toBeVisible();
});

test('recipe detail and cook mode', async ({ page }) => {
  await page.goto('/');
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

test('grocery check-off persists across reload', async ({ page }) => {
  await page.goto('/grocery');
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

test('favoriting a recipe shows it in favorites', async ({ page }) => {
  await page.goto('/recipes');
  await expect(page.getByText('No favorites yet')).toBeVisible();

  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('E2E Salmon')).toBeVisible();
  await page.locator('article', { hasText: 'E2E Salmon' }).getByLabel('Save to favorites').click();

  await page.getByRole('tab', { name: /Favorites/ }).click();
  await expect(page.getByText('E2E Salmon')).toBeVisible();
});
