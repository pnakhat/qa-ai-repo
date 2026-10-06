#!/usr/bin/env node
// Opt-in network/browser checks in a disposable project; no user's MCP config is touched.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { checkMcp } from './check-mcp.js';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cwd = mkdtempSync(join(tmpdir(), 'qa-runtime-'));
console.log(`Runtime evidence: ${cwd}`);
cpSync(join(root, 'fixtures/browser'), cwd, { recursive: true });
const evidence = { environment: { node: process.version, platform: process.platform, arch: process.arch }, commands: [], mcp: {} };
const run = (command, args, expected = 0) => {
  const result = spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  evidence.commands.push({ command, args, status: result.status, output: result.stdout, stderr: result.stderr });
  if (result.error || result.status !== expected) throw new Error(`${command} ${args.join(' ')}: ${result.error || ''}\n${result.stdout}\n${result.stderr}`);
  console.log(`${command} ${args.join(' ')}: expected exit ${expected}`);
  return result;
};
let server;
try {
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  if (!process.env.QA_BROWSER_CHANNEL) run('npx', ['--no-install', 'playwright', 'install', 'chromium']);
  const browserDef = JSON.parse(readFileSync(join(root, 'playwright-e2e/mcp/playwright.json'), 'utf8'));
  browserDef.args.push('--headless');
  if (process.env.QA_BROWSER_CHANNEL) browserDef.args.push('--browser', process.env.QA_BROWSER_CHANNEL);
  else {
    const executable = run(process.execPath, ['--input-type=module', '-e', "import { chromium } from '@playwright/test'; console.log(chromium.executablePath())"]).stdout.trim();
    browserDef.args.push('--executable-path', executable);
  }
  server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="en"><title>Probe</title><h1>MCP local probe</h1></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  evidence.mcp.browser = await checkMcp(browserDef, { cwd, calls: [
    { name: 'browser_navigate', arguments: { url } },
    { name: 'browser_snapshot', arguments: {} },
    { name: 'browser_close', arguments: {} },
  ] });
  if (!JSON.stringify(evidence.mcp.browser.results).includes('MCP local probe')) throw new Error('MCP did not observe the local fixture');
  evidence.mcp.runner = await checkMcp(JSON.parse(readFileSync(join(root, 'playwright-e2e/mcp/playwright-test.json'), 'utf8')), { cwd });
  // Bootstrap only the known healthy baseline, then compare without updates.
  run(process.execPath, ['bootstrap.mjs']);
  run('npx', ['--no-install', 'playwright', 'test', '--repeat-each=2', '--workers=4', '--update-snapshots=none']);
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  if (walk(join(cwd, 'test-results')).some(p => /record-.*\.json$/.test(p))) throw new Error('Fixture left owned records behind');
  run('npx', ['--no-install', 'bddgen', '--config=bdd.config.ts']);
  run('npx', ['--no-install', 'playwright', 'test', '--config=bdd.config.ts', '--repeat-each=2', '--workers=4']);
  writeFileSync(join(cwd, 'features/undefined.feature'), 'Feature: Invalid\n  Scenario: Missing step\n    Given this step has no definition\n');
  const undefinedResult = run('npx', ['--no-install', 'bddgen', '--config=bdd.config.ts'], 1);
  if (!/Missing step|missing step|Undefined step/i.test(undefinedResult.stdout + undefinedResult.stderr)) throw new Error('BDD failed for an unexpected reason');
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed'; evidence.error = error.message; process.exitCode = 1; console.error(error.message);
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  writeFileSync(join(cwd, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`Evidence saved: ${join(cwd, 'evidence.json')}`);
}
