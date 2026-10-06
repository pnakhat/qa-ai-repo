import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { listObjectives } from '../src/registry.js';

for (const objective of listObjectives()) {
  test(`${objective.name}: shipped metadata, reference links, agent bindings and MCP contracts`, () => {
    const metadata = JSON.parse(readFileSync(join(objective.dir, 'objective.json'), 'utf8'));
    assert.ok(metadata.title && metadata.description);
    const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
    for (const skill of objective.contents.skills) {
      const dir = join(objective.dir, 'skills', skill);
      const source = readFileSync(join(dir, 'SKILL.md'), 'utf8');
      assert.equal(source.match(/^name: (.+)$/m)?.[1], skill);
      assert.ok(source.match(/^description: (.+)$/m)?.[1]);
      for (const file of walk(dir).filter(f => f.endsWith('.md'))) {
        for (const [, raw] of readFileSync(file, 'utf8').matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
          if (/^[a-z]+:|^#/i.test(raw)) continue;
          const path = raw.split('#')[0];
          assert.ok(existsSync(resolve(dirname(file), path)), `${file} links to missing ${path}`);
        }
      }
    }
    for (const agent of objective.contents.agents) {
      const source = readFileSync(join(objective.dir, 'agents', agent), 'utf8');
      assert.equal(source.match(/^name: (.+)$/m)?.[1], agent.replace(/\.md$/, ''));
      assert.ok(source.match(/^skills: (.+)$/m)?.[1]);
    }
    for (const file of objective.contents.mcp) {
      const def = JSON.parse(readFileSync(join(objective.dir, 'mcp', file), 'utf8'));
      assert.equal(typeof def.command, 'string');
      assert.ok(Array.isArray(def.args) && def.args.every(a => typeof a === 'string'));
      assert.ok(!def.args.some(a => /@latest|@next/.test(a)), 'floating MCP package');
    }
  });
}
