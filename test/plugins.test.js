// The plugin marketplace is generated from objective.json + mcp/*.json and
// committed (Claude Code reads it from git), so a stale copy ships silently.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../src/registry.js';
import { buildPlugins } from '../scripts/build-plugins.js';

test('committed plugin manifests match `npm run build:plugins`', () => {
  for (const [rel, expected] of Object.entries(buildPlugins())) {
    const abs = join(REPO_ROOT, rel);
    assert.ok(existsSync(abs), `${rel} missing; run npm run build:plugins`);
    assert.equal(readFileSync(abs, 'utf8'), expected, `${rel} is stale; run npm run build:plugins`);
  }
});
