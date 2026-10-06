import { test as base, createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
export const test = base.extend<{ order: { quantity: number; status?: string } }>({
  order: async ({}, use) => { await use({ quantity: 0 }); },
});
const { Given, When, Then } = createBdd(test);
Given('an order quantity of {int}', async ({ order }, quantity: number) => { order.quantity = quantity; });
When('the order is validated', async ({ order }) => { order.status = order.quantity >= 1 && order.quantity <= 10 ? 'accepted' : 'rejected'; });
Then('the order is {string}', async ({ order }, status: string) => { expect(order.status).toBe(status); });
