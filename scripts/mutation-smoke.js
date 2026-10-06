#!/usr/bin/env node
// Seed known installer faults into disposable copies and require the regression suite to reject them.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { listObjectives } from '../src/registry.js';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mutations = [
  ['overwrite-custom-mcp', 'if (existed) {', 'if (false) {'],
  ['corrupt-binary-resource', ": readFileSync(src));", ": readFileSync(src, 'utf8'));"],
  ['drop-nested-markdown-links', "out = out.split('(' + f + '/').join('(' + skillName + '/' + f + '/');", ''],
  ['ignore-dry-run', 'if (ctx.dryRun) {', 'if (false) {'],
];
const source = readFileSync(join(root, 'src/install.js'), 'utf8');
let failed = false;
for (const [name, from, to] of [['healthy-control', '', ''], ...mutations]) {
  const cwd = mkdtempSync(join(tmpdir(), 'qa-mutant-'));
  try {
    for (const path of ['src', 'package.json', ...listObjectives().map(o => o.name)]) cpSync(join(root, path), join(cwd, path), { recursive: true });
    cpSync(join(root, 'test/install-safety.test.js'), join(cwd, 'probe.test.js'));
    // The original test lives one directory below src.
    writeFileSync(join(cwd, 'probe.test.js'), readFileSync(join(cwd, 'probe.test.js'), 'utf8').replaceAll("'../src/", "'./src/"));
    if (from && !source.includes(from)) throw new Error(`Mutation target missing: ${name}`);
    writeFileSync(join(cwd, 'src/install.js'), from ? source.replace(from, to) : source);
    const r = spawnSync(process.execPath, ['--test', 'probe.test.js'], { cwd, encoding: 'utf8', timeout: 30000 });
    if (r.error || (from ? r.status !== 1 || !/fail [1-9]/.test(r.stdout) : r.status !== 0)) {
      failed = true; console.error(`${name}: unexpected outcome\n${r.error || ''}\n${r.stdout?.slice(-5000)}\n${r.stderr?.slice(-2000)}`);
    } else console.log(`${name}: ${from ? 'killed by regression assertions' : 'passed'}`);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
if (failed) process.exitCode = 1;
