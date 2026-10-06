// The plugin marketplace is generated from objective.json + mcp/*.json and
// committed (Claude Code reads it from git), so a stale copy ships silently.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../src/registry.js';
import { buildPlugins } from '../scripts/build-plugins.js';

// Git may check text out with CRLF on Windows. Only normalize that transport
// difference; changes to generated fields or formatting must still fail.
function assertManifestMatches(actual, expected, message) {
  assert.equal(actual.replace(/\r\n/g, '\n'), expected, message);
}

test('manifest comparison accepts Windows line endings but rejects stale content', () => {
  for (const expected of Object.values(buildPlugins())) {
    assertManifestMatches(expected.replace(/\n/g, '\r\n'), expected);
    const stale = JSON.parse(expected);
    stale.name += '-stale';
    assert.throws(() => assertManifestMatches(JSON.stringify(stale, null, 2).replace(/\n/g, '\r\n') + '\r\n', expected), assert.AssertionError);
  }
});

test('committed plugin manifests match `npm run build:plugins`', () => {
  for (const [rel, expected] of Object.entries(buildPlugins())) {
    const abs = join(REPO_ROOT, rel);
    assert.ok(existsSync(abs), `${rel} missing; run npm run build:plugins`);
    assertManifestMatches(readFileSync(abs, 'utf8'), expected, `${rel} is stale; run npm run build:plugins`);
  }
});
