import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { install } from '../src/install.js';
import { listObjectives, loadObjective } from '../src/registry.js';

const dirs = [];
const fresh = () => { const p = mkdtempSync(join(tmpdir(), 'qa-safety-')); dirs.push(p); return p; };
afterEach(() => dirs.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
const write = (p, value) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, value); };
const snapshot = (root, dir = root) => Object.fromEntries(readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = join(dir, e.name);
  return e.isDirectory() ? Object.entries(snapshot(root, p)) : [[relative(root, p).split(sep).join('/'), createHash('sha256').update(readFileSync(p)).digest('hex')]];
}));

for (const tool of ['claude', 'cursor', 'windsurf', 'agents']) {
  test(`${tool}: all objectives install, repeat byte-for-byte, and dry-run writes nothing`, () => {
    const cwd = fresh();
    const home = fresh();
    for (const o of listObjectives()) install(o, [tool], { cwd, home, dryRun: true, log() {} });
    assert.deepEqual(snapshot(cwd), {});
    assert.deepEqual(snapshot(home), {});
    for (const o of listObjectives()) install(o, [tool], { cwd, home, log() {} });
    const before = { project: snapshot(cwd), home: snapshot(home) };
    assert.ok(Object.keys(before.project).length > 0);
    if (tool === 'windsurf') assert.ok(before.home['.codeium/windsurf/mcp_config.json']);
    else assert.deepEqual(before.home, {});
    for (const o of listObjectives()) install(o, [tool], { cwd, home, log() {} });
    assert.deepEqual({ project: snapshot(cwd), home: snapshot(home) }, before);
  });
}

for (const [tool, path] of [['claude', '.mcp.json'], ['cursor', '.cursor/mcp.json'], ['windsurf', '.codeium/windsurf/mcp_config.json']]) {
  test(`${tool}: preserve custom MCP args, env, unrelated servers and top-level configuration`, () => {
    const cwd = fresh();
    const file = join(cwd, path);
    const config = { custom: true, mcpServers: { playwright: { command: 'custom-browser', args: ['--custom'], env: { TEST: 'local' } }, other: { command: 'other' } } };
    write(file, JSON.stringify(config));
    install(loadObjective('playwright-e2e'), [tool], { cwd, home: cwd, log() {} });
    const actual = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(actual.mcpServers.playwright, config.mcpServers.playwright);
    assert.deepEqual(actual.mcpServers.other, config.mcpServers.other);
    assert.equal(actual.custom, true);
    assert.equal(actual.mcpServers['playwright-test'].command, 'npx');
  });
}

for (const bad of ['{', 'null', '[]', '42', '{"mcpServers":[]}', '{"mcpServers":null}', '{"mcpServers":"x"}']) {
  test(`reject malformed MCP without changing original bytes: ${bad}`, () => {
    const cwd = fresh();
    const p = join(cwd, '.mcp.json');
    write(p, bad);
    assert.throws(() => install(loadObjective('playwright-e2e'), ['claude'], { cwd, home: cwd, log() {} }), /JSON|object/);
    assert.equal(readFileSync(p, 'utf8'), bad);
  });
}

test('nested references and binary assets survive every adapter', () => {
  const dir = fresh();
  const base = join(dir, 'skills', 'sample');
  write(join(base, 'SKILL.md'), '---\nname: sample\ndescription: Sample fixture\n---\nRead [guide](references/guide.md) and `assets/icon.png`.\n');
  write(join(base, 'references', 'guide.md'), 'Keep local [details](details.md).\n');
  write(join(base, 'references', 'details.md'), 'Details\n');
  const bytes = Buffer.from([0, 255, 128, 13, 10, 0, 42]);
  write(join(base, 'assets', 'icon.png'), bytes);
  write(join(base, 'top.bin'), bytes);
  const objective = { dir, contents: { skills: ['sample'], agents: [], mcp: [] } };
  for (const [tool, prefix, rule] of [
    ['claude', '.claude/skills/sample', '.claude/skills/sample/SKILL.md'],
    ['cursor', '.cursor/rules/sample', '.cursor/rules/sample.mdc'],
    ['windsurf', '.windsurf/rules/sample', '.windsurf/rules/sample.md'],
    ['agents', '.qa-ai/sample', 'AGENTS.md'],
  ]) {
    const cwd = fresh();
    install(objective, [tool], { cwd, home: cwd, log() {} });
    assert.deepEqual(readFileSync(join(cwd, prefix, 'assets/icon.png')), bytes);
    assert.deepEqual(readFileSync(join(cwd, prefix, 'top.bin')), bytes);
    const text = readFileSync(join(cwd, rule), 'utf8');
    const guide = text.match(/\[guide\]\(([^)]+)\)/)[1];
    assert.equal(readFileSync(join(dirname(join(cwd, rule)), guide), 'utf8'), 'Keep local [details](details.md).\n');
  }
});


test('AGENTS section names do not collide with a longer existing heading', () => {
  const cwd = fresh();
  write(join(cwd, 'AGENTS.md'), '# Existing\n\n## playwright-e2e-custom\nKeep this.\n');
  install(loadObjective('playwright-e2e'), ['agents'], { cwd, home: cwd, log() {} });
  const text = readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
  assert.match(text, /^## playwright-e2e$/m);
  assert.match(text, /Keep this\./);
});
