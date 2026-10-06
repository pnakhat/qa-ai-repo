#!/usr/bin/env node
// Requires an existing k6 executable; uses only loopback and a two-iteration budget.
import { mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cwd = mkdtempSync(join(tmpdir(), 'qa-k6-'));
cpSync(join(root, 'performance-testing/skills/performance-testing/scripts/safe-target.js'), join(cwd, 'safe-target.js'));
writeFileSync(join(cwd, 'probe.js'), `
import http from 'k6/http';
import { check } from 'k6';
import { assertSafeTarget } from './safe-target.js';
export const options = { vus: 1, iterations: 2, maxRedirects: 0, thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'] } };
export function setup() { assertSafeTarget(__ENV.QA_BASE_URL, ['127.0.0.1']); }
export default function () { const r = http.get(__ENV.QA_BASE_URL); check(r, { 'status is 200': r => r.status === 200 }); }
`);
let redirected = 0;
const server = createServer((req, res) => {
  if (req.url === '/redirect') { res.writeHead(302, { Location: '/unexpected' }); res.end(); }
  else { if (req.url === '/unexpected') redirected++; res.writeHead(req.url === '/bad' ? 500 : 200); res.end('probe'); }
});
const results = [];
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [name, url, expected] of [['healthy', base, 0], ['bad-response', `${base}/bad`, 99], ['redirect', `${base}/redirect`, 99], ['userinfo-bypass', `http://127.0.0.1:password@localhost:${server.address().port}`, null]]) {
    const result = await new Promise(resolve => execFile('k6', ['run', '--no-usage-report', '--address=127.0.0.1:0', '-e', `QA_BASE_URL=${url}`, 'probe.js'], { cwd, timeout: 30000 }, (error, stdout, stderr) => resolve({ name, code: error?.code ?? 0, stdout, stderr })));
    results.push(result);
    if (expected === null ? !result.code || !/Refusing target/.test(result.stderr + result.stdout) : result.code !== expected) throw new Error(`${name}: unexpected exit ${result.code}`);
    console.log(`${name}: expected ${expected ?? 'setup rejection'} observed (${result.code})`);
  }
  if (redirected) throw new Error('k6 followed a forbidden redirect');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  await new Promise(resolve => server.close(resolve));
  writeFileSync(join(cwd, 'evidence.json'), JSON.stringify({ results, redirected }, null, 2));
  console.log(`Performance probe evidence: ${cwd}`);
}
