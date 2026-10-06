import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// The fixture is deliberately small: it tests the advice's mechanics, not an application.
const test = base.extend<{ ownedRecord: string }>({
  ownedRecord: async ({}, use, testInfo) => {
    const path = testInfo.outputPath(`record-${randomUUID()}.json`);
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(path, '{}');
    try { await use(path); }
    finally { rmSync(path); expect(existsSync(path)).toBe(false); }
  },
});
const document = (body: string) => `<!doctype html><html lang="en"><head><title>QA fixture</title></head><body><main><h1>Quality fixture</h1>${body}</main></body></html>`;

test('web-first assertion observes asynchronous user outcome with owned data', async ({ page, ownedRecord }) => {
  expect(existsSync(ownedRecord)).toBe(true);
  await page.setContent(document('<button onclick="setTimeout(() => document.querySelector(\'output\').textContent = \'Saved\', 25)">Save</button><output aria-live="polite"></output>'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
});

test('response waiter registered before action catches immediate response', async ({ page }) => {
  await page.route('http://qa.test/**', route => {
    if (route.request().url().endsWith('/api/order')) return route.fulfill({ json: { status: 'saved' } });
    return route.fulfill({ contentType: 'text/html', body: document('<button onclick="fetch(\'/api/order\').then(r=>r.json()).then(x=>document.querySelector(\'output\').textContent=x.status)">Save</button><output></output>') });
  });
  await page.goto('http://qa.test/');
  const response = page.waitForResponse(r => r.url().endsWith('/api/order') && r.request().method() === 'GET' && r.status() === 200);
  await page.getByRole('button', { name: 'Save' }).click();
  await response;
  await expect(page.getByRole('status')).toHaveText('saved');
});

test('axe catches unnamed button and accepts the corrected state', async ({ page }) => {
  await page.setContent(document('<button></button>'));
  const broken = await new AxeBuilder({ page }).withRules(['button-name']).analyze();
  expect(broken.violations.map(v => v.id)).toContain('button-name');
  await page.getByRole('button').evaluate(button => button.textContent = 'Save');
  const fixed = await new AxeBuilder({ page }).withRules(['button-name']).analyze();
  expect(fixed.violations).toEqual([]);
});

test('dialog keyboard flow restores focus', async ({ page }) => {
  await page.setContent(document('<button id="open" onclick="document.querySelector(\'dialog\').showModal()">Edit</button><dialog aria-label="Edit profile"><label>Name<input autofocus></label><button onclick="document.querySelector(\'dialog\').close()">Close</button></dialog>'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
});

test('screenshot comparator catches a changed component and accepts restoration', async ({ page }) => {
  await page.setContent(document('<div style="width:100px;height:60px;background:rgb(255,0,0)"></div>'));
  const box = page.locator('main > div');
  await expect(box).toHaveScreenshot('component.png', { maxDiffPixels: 0 });
  await box.evaluate(e => (e as HTMLElement).style.background = 'rgb(0,0,255)');
  let detected = false;
  try { await expect(box).toHaveScreenshot('component.png', { maxDiffPixels: 0, timeout: 300 }); }
  catch (error) { detected = /Screenshot comparison failed|pixels.*different|Expected.*pixels/s.test(String(error)); }
  expect(detected, 'the deliberately changed component must fail comparison').toBe(true);
  await box.evaluate(e => (e as HTMLElement).style.background = 'rgb(255,0,0)');
  await expect(box).toHaveScreenshot('component.png', { maxDiffPixels: 0 });
});

test('fixture cleans up even when a test has an expected assertion failure', async ({ ownedRecord }) => {
  test.fail(true, 'fault injection: exercise failure teardown');
  expect(existsSync(ownedRecord)).toBe(true);
  expect('fault').toBe('healthy');
});
