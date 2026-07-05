import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listObjectives, loadObjective, KINDS } from './registry.js';
import { install, detectTools, TOOLS } from './install.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
};

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run' || a === '-n') flags.dryRun = true;
    else if (a === '--tool' || a === '-t') flags.tool = args[++i];
    else if (a.startsWith('--tool=')) flags.tool = a.slice('--tool='.length);
    else positional.push(a);
  }
  return { flags, positional };
}

function resolveTools(flag) {
  if (flag) {
    const requested = flag.split(',').map((s) => s.trim()).filter(Boolean);
    if (requested.includes('all')) return { tools: TOOLS, note: '' };
    for (const t of requested) {
      if (!TOOLS.includes(t)) throw new Error(`unknown tool "${t}" (known: ${TOOLS.join(', ')}, all)`);
    }
    return { tools: requested, note: '' };
  }
  const detected = detectTools();
  if (detected.length) return { tools: detected, note: `auto-detected: ${detected.join(', ')}` };
  return { tools: ['claude', 'cursor'], note: 'no tool detected — defaulting to claude, cursor (use --tool to override)' };
}

function cmdList() {
  const objectives = listObjectives();
  if (!objectives.length) {
    console.log('No objectives yet. Add a folder with skills/ agents/ mcp/ under it.');
    return;
  }
  console.log(`\n${c.bold('QA objectives')} ${c.dim('(' + pkg.name + ' v' + pkg.version + ')')}\n`);
  for (const o of objectives) {
    console.log(`  ${c.cyan(o.name)}  ${c.dim('— ' + o.title)}`);
    if (o.description) console.log(`    ${c.dim(o.description)}`);
    const parts = KINDS
      .filter((k) => o.contents[k].length)
      .map((k) => `${o.contents[k].length} ${k}`);
    console.log(`    ${c.dim(parts.join('  ·  ') || 'empty')}\n`);
  }
  console.log(c.dim(`Install with:  npx ${pkg.name} add <objective>\n`));
}

function cmdDetect() {
  const detected = detectTools();
  console.log(detected.length
    ? `Detected tools in this project: ${c.green(detected.join(', '))}`
    : 'No AI tools detected in this project (no .claude/.cursor/.windsurf).');
}

function cmdAdd(positional, flags) {
  const name = positional[0];
  if (!name) throw new Error(`missing objective name. Try:  npx ${pkg.name} list`);

  const objective = loadObjective(name);
  if (!objective) {
    const available = listObjectives().map((o) => o.name).join(', ');
    throw new Error(`objective "${name}" not found. Available: ${available || '(none)'}`);
  }

  const { tools, note } = resolveTools(flags.tool);
  console.log(`\nInstalling ${c.cyan(objective.name)} into: ${c.bold(tools.join(', '))}`);
  if (note) console.log(c.dim(note));
  if (flags.dryRun) console.log(c.dim('(dry run — no files written)'));

  install(objective, tools, { dryRun: flags.dryRun });

  console.log(`\n${flags.dryRun ? c.dim('Dry run complete.') : c.green('Done.')}`);
}

function help() {
  console.log(`
${c.bold(pkg.name)} ${c.dim('v' + pkg.version)}
${pkg.description}

${c.bold('Usage')}
  npx ${pkg.name} <command> [options]

${c.bold('Commands')}
  list                       List available QA objectives
  add <objective>            Install an objective's skills/agents/mcp
  detect                     Show which AI tools are detected here
  help                       Show this help

${c.bold('Options')}
  -t, --tool <list>          Comma-separated: ${TOOLS.join(', ')}, all
                             (default: auto-detected, else claude,cursor)
  -n, --dry-run              Show what would be written without writing

${c.bold('Examples')}
  npx ${pkg.name} list
  npx ${pkg.name} add playwright-e2e
  npx ${pkg.name} add playwright-e2e --tool cursor,claude
  npx ${pkg.name} add playwright-e2e --tool all --dry-run
`);
}

export async function main(argv) {
  const { flags, positional } = parseFlags(argv);
  const cmd = positional.shift();

  if (flags.version || cmd === '--version') return void console.log(pkg.version);
  switch (cmd) {
    case 'list': case 'ls': return cmdList();
    case 'add': case 'install': return cmdAdd(positional, flags);
    case 'detect': return cmdDetect();
    case undefined: case 'help': case '--help': case '-h': return help();
    default:
      throw new Error(`unknown command "${cmd}". Run:  npx ${pkg.name} help`);
  }
}
