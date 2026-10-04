// Regression guard: a SKILL.md that points at a sibling file must not install a
// rule whose link dangles. Claude Code copies the skill directory wholesale, but
// the cursor/windsurf/agents adapters rebuild one file from SKILL.md and used to
// drop every sibling, so `reference.md` resolved to nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { install } from '../src/install.js';
import { loadObjective, listObjectives } from '../src/registry.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fresh = () => mkdtempSync(join(tmpdir(), 'qa-ai-test-'));

// Every `sub/dir/file.md` reference in an installed rule must exist on disk.
function deadLinks(ruleFile, resolveFrom) {
  const text = readFileSync(ruleFile, 'utf8');
  const refs = [...text.matchAll(/`([A-Za-z0-9_./-]+\.md)`/g)].map((m) => m[1]);
  return refs.filter((r) => r.includes('/') && !existsSync(join(resolveFrom, r)));
}

test('cursor install carries skill sibling files and leaves no dead links', () => {
  const cwd = fresh();
  install(loadObjective('playwright-e2e'), ['cursor'], { cwd, log() {} });

  const rules = join(cwd, '.cursor', 'rules');
  assert.ok(existsSync(join(rules, 'playwright-e2e.mdc')), 'rule written');
  assert.ok(
    existsSync(join(rules, 'playwright-e2e', 'reference.md')),
    'reference.md must travel with the rule',
  );
  assert.deepEqual(deadLinks(join(rules, 'playwright-e2e.mdc'), rules), []);
});

test('siblings are namespaced per skill, so same-named files cannot collide', () => {
  const cwd = fresh();
  const objectives = listObjectives().map((o) => o.name);
  for (const name of objectives) install(loadObjective(name), ['cursor'], { cwd, log() {} });

  const rules = join(cwd, '.cursor', 'rules');
  // More than one objective ships a file called reference.md; a flat copy would
  // have them overwrite each other down to a single file.
  const references = readdirSync(rules, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(rules, e.name, 'reference.md')));
  assert.ok(references.length > 1, `expected several reference.md copies, got ${references.length}`);

  for (const f of readdirSync(rules).filter((f) => f.endsWith('.mdc'))) {
    assert.deepEqual(deadLinks(join(rules, f), rules), [], `dead link in ${f}`);
  }
});

test('cursor and windsurf agents inline the skill guardrails skills: would preload', () => {
  // Claude Code preloads SKILL.md via skills: frontmatter. These adapters drop
  // that field, so the agent rule has to carry the skill body itself.
  const cwd = fresh();
  install(loadObjective('jest-coverage-mutation'), ['cursor', 'windsurf', 'claude'], { cwd, log() {} });

  const marker = 'Anti-patterns — smells to reject';
  const cursorAgent = readFileSync(join(cwd, '.cursor', 'rules', 'test-effectiveness-auditor.mdc'), 'utf8');
  const windsurfAgent = readFileSync(join(cwd, '.windsurf', 'rules', 'test-effectiveness-auditor.md'), 'utf8');
  assert.ok(cursorAgent.includes(marker), 'cursor agent is missing SKILL.md guardrails');
  assert.ok(windsurfAgent.includes(marker), 'windsurf agent is missing SKILL.md guardrails');
  assert.match(cursorAgent, /`jest-coverage-mutation\/reference\.md`/);
  assert.match(windsurfAgent, /`jest-coverage-mutation\/reference\.md`/);
  assert.deepEqual(deadLinks(join(cwd, '.cursor', 'rules', 'test-effectiveness-auditor.mdc'), join(cwd, '.cursor', 'rules')), []);
  assert.deepEqual(deadLinks(join(cwd, '.windsurf', 'rules', 'test-effectiveness-auditor.md'), join(cwd, '.windsurf', 'rules')), []);

  const claudeAgent = readFileSync(join(cwd, '.claude', 'agents', 'test-effectiveness-auditor.md'), 'utf8');
  assert.ok(!claudeAgent.includes(marker), 'claude keeps skills: preload and must not inline SKILL.md');
});

test('agent skill-file references resolve in every install route', () => {
  // Agent sources say "the `x.md` file in the `<skill>` skill's directory" so the
  // same text works from .claude/skills/ and from a plugin cache. Cursor,
  // Windsurf, and AGENTS.md get a concrete path to the copied sibling instead.
  const cwd = fresh();
  for (const name of listObjectives().map((o) => o.name)) {
    install(loadObjective(name), ['cursor', 'windsurf', 'agents'], { cwd, log() {} });
  }
  const rules = [
    ...readdirSync(join(cwd, '.cursor', 'rules')).filter((f) => f.endsWith('.mdc')).map((f) => join(cwd, '.cursor', 'rules', f)),
    ...readdirSync(join(cwd, '.windsurf', 'rules')).filter((f) => f.endsWith('.md')).map((f) => join(cwd, '.windsurf', 'rules', f)),
  ];
  for (const f of rules) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!text.includes("skill's directory"), `${f} kept the plugin-only phrasing`);
    assert.ok(!text.includes('.claude/skills/'), `${f} points at a Claude-only path`);
    assert.deepEqual(deadLinks(f, dirname(f)), [], `dead link in ${f}`);
  }
  const cursorAgent = readFileSync(join(cwd, '.cursor', 'rules', 'qa-e2e-author.mdc'), 'utf8');
  assert.match(cursorAgent, /`playwright-e2e\/reference\.md`/);
  const agentsMd = readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
  assert.match(agentsMd, /`\.qa-ai\/playwright-e2e\/reference\.md`/);
  assert.deepEqual(deadLinks(join(cwd, 'AGENTS.md'), cwd), []);

  // Claude Code installs keep the location-neutral wording verbatim.
  install(loadObjective('playwright-e2e'), ['claude'], { cwd, log() {} });
  const claudeAgent = readFileSync(join(cwd, '.claude', 'agents', 'qa-e2e-author.md'), 'utf8');
  assert.match(claudeAgent, /the `reference\.md` file in the `playwright-e2e` skill's directory/);
});

test('an agent that is told to use an MCP server does not restrict its tools', () => {
  // An explicit `tools:` allowlist in agent frontmatter excludes mcp__* tools,
  // which silently disables the MCP server the same objective installs.
  for (const name of listObjectives().map((o) => o.name)) {
    const obj = loadObjective(name);
    if (!obj.contents.mcp.length) continue;
    for (const agentFile of obj.contents.agents) {
      const text = readFileSync(join(obj.dir, 'agents', agentFile), 'utf8');
      if (!/MCP/i.test(text)) continue;
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      assert.ok(fm, `${agentFile} has frontmatter`);
      assert.ok(
        !/^tools:/m.test(fm[1]),
        `${name}/${agentFile} relies on MCP but declares a tools: allowlist that excludes it`,
      );
    }
  }
});

test('the playwright setup project is discoverable from the documented layout', () => {
  // testDir scopes discovery to ./tests/e2e; global.setup.ts sits at the repo
  // root, so without its own testDir the setup project matches zero tests and
  // every spec dies on a missing storageState file.
  const ref = readFileSync(
    join(root, 'playwright-e2e', 'skills', 'playwright-e2e', 'reference.md'),
    'utf8',
  );
  const setupLine = ref.split('\n').find((l) => l.includes("name: 'setup'"));
  assert.ok(setupLine, 'reference.md documents a setup project');
  assert.match(setupLine, /testDir:/, 'setup project must override testDir');
});
