// Discovers "objectives" — top-level folders in this repo that contain any of
// skills/ agents/ mcp/. The package ships its objective folders at the repo
// root (siblings of bin/ and src/), so we scan REPO_ROOT and skip reserved and
// underscore-prefixed names (like _template).

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..');

const RESERVED = new Set([
  'bin', 'src', 'node_modules', 'scripts', 'test', 'tests', 'coverage',
]);

export const KINDS = ['skills', 'agents', 'mcp'];

function isReserved(name) {
  return RESERVED.has(name) || name.startsWith('.') || name.startsWith('_');
}

export function loadObjective(name) {
  const dir = join(REPO_ROOT, name);
  if (!existsSync(dir)) return null;

  const contents = {};
  let hasAny = false;
  for (const kind of KINDS) {
    const kdir = join(dir, kind);
    if (existsSync(kdir)) {
      contents[kind] = readdirSync(kdir, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => e.name);
      if (contents[kind].length) hasAny = true;
    } else {
      contents[kind] = [];
    }
  }

  const metaPath = join(dir, 'objective.json');
  let meta = {};
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch {
      /* ignore malformed metadata */
    }
  }

  if (!hasAny && !existsSync(metaPath)) return null;

  return {
    name,
    dir,
    title: meta.title || name,
    description: meta.description || '',
    contents,
  };
}

export function listObjectives() {
  return readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !isReserved(d.name))
    .map((d) => loadObjective(d.name))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}
