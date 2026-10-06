import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'quality.spec.ts', fullyParallel: true, retries: 0,
  forbidOnly: true, workers: 4,
  use: { channel: process.env.QA_BROWSER_CHANNEL || undefined, headless: true, trace: 'retain-on-failure' },
});
