// Installs an objective's skills/agents/mcp into a target AI tool by writing
// the files each tool expects. All writes are relative to process.cwd() (the
// user's project), except Windsurf's MCP config which is global.

import {
  existsSync, readFileSync, writeFileSync, mkdirSync, cpSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { KINDS } from './registry.js';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

// ---- small helpers -------------------------------------------------------

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: md };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: m[2] };
}

function toMdc(data, body) {
  const desc = (data.description || '').replace(/\n/g, ' ');
  return `---\ndescription: ${desc}\nglobs:\nalwaysApply: false\n---\n\n${body.trim()}\n`;
}

// ---- write primitives ----------------------------------------------------

function ensureWrite(ctx, absPath, content) {
  const rel = relForLog(absPath);
  if (ctx.dryRun) {
    ctx.log(`  ${c.yellow('would write')} ${rel}`);
    return;
  }
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content);
  ctx.log(`  ${c.green('wrote')}       ${rel}`);
}

function copyDir(ctx, src, dest) {
  const rel = relForLog(dest);
  if (ctx.dryRun) {
    ctx.log(`  ${c.yellow('would copy')}  ${rel}${'/'}`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  ctx.log(`  ${c.green('copied')}      ${rel}/`);
}

function mergeMcp(ctx, targetPath, serverName, serverDef) {
  let config = { mcpServers: {} };
  if (existsSync(targetPath)) {
    try {
      config = JSON.parse(readFileSync(targetPath, 'utf8'));
    } catch {
      throw new Error(`${targetPath} exists but is not valid JSON; fix or remove it first`);
    }
  }
  config.mcpServers = config.mcpServers || {};
  const existed = Boolean(config.mcpServers[serverName]);
  config.mcpServers[serverName] = serverDef;

  const rel = relForLog(targetPath);
  const verb = existed ? 'updated mcp' : 'added mcp';
  if (ctx.dryRun) {
    ctx.log(`  ${c.yellow('would ' + verb)} "${serverName}" -> ${rel}`);
    return;
  }
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(config, null, 2) + '\n');
  ctx.log(`  ${c.green(verb)}   "${serverName}" -> ${rel}`);
}

function relForLog(abs) {
  const cwd = process.cwd();
  return abs.startsWith(cwd) ? abs.slice(cwd.length + 1) : abs;
}

// ---- tool adapters -------------------------------------------------------
// Each adapter maps the three kinds into the files a given tool consumes.

function readSkill(objective, skillName) {
  const skillMd = join(objective.dir, 'skills', skillName, 'SKILL.md');
  const raw = existsSync(skillMd) ? readFileSync(skillMd, 'utf8') : '';
  const { data, body } = parseFrontmatter(raw);
  return { skillMd, raw, data, body };
}

const adapters = {
  claude: {
    label: 'Claude Code',
    skill(ctx, objective, skillName) {
      copyDir(ctx, join(objective.dir, 'skills', skillName), join(ctx.cwd, '.claude', 'skills', skillName));
    },
    agent(ctx, objective, agentFile) {
      const src = join(objective.dir, 'agents', agentFile);
      ensureWrite(ctx, join(ctx.cwd, '.claude', 'agents', agentFile), readFileSync(src, 'utf8'));
    },
    mcp(ctx, objective, mcpFile) {
      const name = basename(mcpFile, '.json');
      const def = JSON.parse(readFileSync(join(objective.dir, 'mcp', mcpFile), 'utf8'));
      mergeMcp(ctx, join(ctx.cwd, '.mcp.json'), name, def);
    },
  },

  cursor: {
    label: 'Cursor',
    skill(ctx, objective, skillName) {
      const { data, body } = readSkill(objective, skillName);
      ensureWrite(ctx, join(ctx.cwd, '.cursor', 'rules', `${skillName}.mdc`), toMdc(data, body));
    },
    agent(ctx, objective, agentFile) {
      const name = basename(agentFile, '.md');
      const { data, body } = parseFrontmatter(readFileSync(join(objective.dir, 'agents', agentFile), 'utf8'));
      ensureWrite(ctx, join(ctx.cwd, '.cursor', 'rules', `${name}.mdc`), toMdc(data, body));
    },
    mcp(ctx, objective, mcpFile) {
      const name = basename(mcpFile, '.json');
      const def = JSON.parse(readFileSync(join(objective.dir, 'mcp', mcpFile), 'utf8'));
      mergeMcp(ctx, join(ctx.cwd, '.cursor', 'mcp.json'), name, def);
    },
  },

  windsurf: {
    label: 'Windsurf',
    skill(ctx, objective, skillName) {
      const { data, body } = readSkill(objective, skillName);
      const md = `# ${data.name || skillName}\n\n${data.description || ''}\n\n${body.trim()}\n`;
      ensureWrite(ctx, join(ctx.cwd, '.windsurf', 'rules', `${skillName}.md`), md);
    },
    agent(ctx, objective, agentFile) {
      const name = basename(agentFile, '.md');
      const { data, body } = parseFrontmatter(readFileSync(join(objective.dir, 'agents', agentFile), 'utf8'));
      const md = `# ${data.name || name}\n\n${data.description || ''}\n\n${body.trim()}\n`;
      ensureWrite(ctx, join(ctx.cwd, '.windsurf', 'rules', `${name}.md`), md);
    },
    mcp(ctx, objective, mcpFile) {
      const name = basename(mcpFile, '.json');
      const def = JSON.parse(readFileSync(join(objective.dir, 'mcp', mcpFile), 'utf8'));
      // Windsurf reads a single global MCP config file.
      mergeMcp(ctx, join(homedir(), '.codeium', 'windsurf', 'mcp_config.json'), name, def);
    },
  },

  agents: {
    label: 'AGENTS.md (generic)',
    skill(ctx, objective, skillName) {
      const { data, body } = readSkill(objective, skillName);
      appendAgentsMd(ctx, data.name || skillName, data.description, body);
    },
    agent(ctx, objective, agentFile) {
      const name = basename(agentFile, '.md');
      const { data, body } = parseFrontmatter(readFileSync(join(objective.dir, 'agents', agentFile), 'utf8'));
      appendAgentsMd(ctx, data.name || name, data.description, body);
    },
    mcp(ctx, objective, mcpFile) {
      const name = basename(mcpFile, '.json');
      const def = readFileSync(join(objective.dir, 'mcp', mcpFile), 'utf8').trim();
      ctx.log(`  ${c.yellow('mcp (manual)')} add "${name}" to your tool's MCP config:`);
      ctx.log(c.dim(def.split('\n').map((l) => '      ' + l).join('\n')));
    },
  },
};

function appendAgentsMd(ctx, name, description, body) {
  const target = join(ctx.cwd, 'AGENTS.md');
  const heading = `## ${name}`;
  const section = `${heading}\n\n${description ? description + '\n\n' : ''}${body.trim()}\n`;
  let existing = existsSync(target) ? readFileSync(target, 'utf8') : '# AGENTS.md\n\n';
  if (existing.includes(heading)) {
    ctx.log(`  ${c.dim('skip')}        AGENTS.md already has "${name}"`);
    return;
  }
  ensureWrite(ctx, target, existing.replace(/\s*$/, '\n\n') + section);
}

export const TOOLS = Object.keys(adapters);

// ---- tool detection ------------------------------------------------------

export function detectTools(cwd = process.cwd()) {
  const found = [];
  if (existsSync(join(cwd, '.claude')) || existsSync(join(cwd, '.mcp.json')) || existsSync(join(cwd, 'CLAUDE.md'))) found.push('claude');
  if (existsSync(join(cwd, '.cursor')) || existsSync(join(cwd, '.cursorrules'))) found.push('cursor');
  if (existsSync(join(cwd, '.windsurf'))) found.push('windsurf');
  return found;
}

// ---- orchestration -------------------------------------------------------

export function install(objective, tools, { dryRun = false, cwd = process.cwd(), log = console.log } = {}) {
  const ctx = { dryRun, cwd, log };
  for (const tool of tools) {
    const adapter = adapters[tool];
    if (!adapter) throw new Error(`unknown tool "${tool}" (known: ${TOOLS.join(', ')})`);
    log(`\n${c.cyan('▸ ' + adapter.label)}`);
    for (const kind of KINDS) {
      for (const item of objective.contents[kind]) {
        adapter[kind === 'skills' ? 'skill' : kind === 'agents' ? 'agent' : 'mcp'](ctx, objective, item);
      }
    }
  }
}
