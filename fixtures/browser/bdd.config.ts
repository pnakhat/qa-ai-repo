import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
export default defineConfig({
  testDir: defineBddConfig({ features: 'features/*.feature', steps: 'steps/*.ts', missingSteps: 'fail-on-gen' }),
  retries: 0, fullyParallel: true, forbidOnly: true,
});
