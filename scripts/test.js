#!/usr/bin/env node
// Explicit discovery avoids version-dependent traversal of local/ignored worktrees.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = readdirSync(join(root, 'test')).filter(f => f.endsWith('.test.js')).sort().map(f => join(root, 'test', f));
if (!files.length) throw new Error('No regression test files discovered');
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
