#!/usr/bin/env node
// Generates the Claude Code plugin marketplace from the objective folders:
//   .claude-plugin/marketplace.json              (repo root, one entry per objective)
//   <objective>/.claude-plugin/plugin.json       (MCP servers inlined from mcp/*.json)
// objective.json and mcp/*.json stay the source of truth; rerun after editing
// them or bumping package.json's version. Output is committed because Claude
// Code reads marketplaces straight from git.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, listObjectives } from '../src/registry.js';

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
const repoUrl = (pkg.repository?.url || pkg.repository || '').replace(/^git\+/, '').replace(/\.git$/, '');
const author = { name: pkg.author };

const json = (o) => JSON.stringify(o, null, 2) + '\n';

// Returns { relativePath: content } for every generated file.
export function buildPlugins() {
  const files = {};
  const objectives = listObjectives();

  for (const o of objectives) {
    const manifest = {
      name: o.name,
      displayName: o.title,
      version: pkg.version,
      description: o.description,
      author,
      homepage: `${repoUrl}/tree/main/${o.name}`,
      repository: repoUrl,
      license: pkg.license,
      keywords: ['qa', 'testing', o.name],
    };
    if (o.contents.mcp.length) {
      manifest.mcpServers = Object.fromEntries(o.contents.mcp.map((f) => [
        basename(f, '.json'),
        JSON.parse(readFileSync(join(o.dir, 'mcp', f), 'utf8')),
      ]));
    }
    files[join(o.name, '.claude-plugin', 'plugin.json')] = json(manifest);
  }

  files[join('.claude-plugin', 'marketplace.json')] = json({
    name: pkg.name,
    description: pkg.description,
    owner: { name: pkg.author, url: repoUrl },
    plugins: objectives.map((o) => ({
      name: o.name,
      source: `./${o.name}`,
      description: o.description,
      category: 'testing',
    })),
  });
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [rel, content] of Object.entries(buildPlugins())) {
    const abs = join(REPO_ROOT, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    console.log(`wrote ${rel}`);
  }
}
