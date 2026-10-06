import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ channel: process.env.QA_BROWSER_CHANNEL || undefined });
try {
  console.log(JSON.stringify({ browserVersion: browser.version(), channel: process.env.QA_BROWSER_CHANNEL || 'bundled-chromium', platform: process.platform, arch: process.arch }));
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html lang="en"><head><title>QA fixture</title></head><body><main><h1>Quality fixture</h1><div style="width:100px;height:60px;background:rgb(255,0,0)"></div></main></body></html>');
  mkdirSync('quality.spec.ts-snapshots', { recursive: true });
  await page.locator('div').screenshot({ path: `quality.spec.ts-snapshots/component-${process.platform}.png`, animations: 'disabled', scale: 'css' });
} finally { await browser.close(); }
