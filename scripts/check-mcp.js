#!/usr/bin/env node
// Bounded stdio lifecycle probe. Does not equate tool discovery with a test run.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function checkMcp(definition, { cwd = process.cwd(), timeout = 45000, calls = [] } = {}) {
  const child = spawn(definition.command, definition.args, {
    cwd, env: { ...process.env, ...definition.env }, stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let buffer = '', stderr = '', nextId = 0;
  const pending = new Map();
  let terminalError;
  const fail = error => {
    terminalError = error;
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); }
    pending.clear();
  };
  child.on('error', fail);
  child.stdin.on('error', fail);
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  child.on('exit', code => fail(new Error(`MCP exited (${code}): ${stderr}`)));
  child.stdout.on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 4 * 1024 * 1024) return fail(new Error('MCP response exceeds 4 MiB'));
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { fail(new Error('MCP stdout contains non-JSON data')); return; }
      const waiting = pending.get(message.id);
      if (!waiting) continue;
      pending.delete(message.id); clearTimeout(waiting.timer);
      if (message.jsonrpc !== '2.0' || message.error || !Object.hasOwn(message, 'result')) {
        waiting.reject(new Error(`Invalid/error MCP response: ${JSON.stringify(message)}`));
      } else waiting.resolve(message.result);
    }
  });
  const send = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    if (terminalError) return reject(terminalError);
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timed out after ${timeout}ms`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    send({ id, method, params });
  });
  try {
    const initialized = await request('initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'qa-ai-probe', version: '1.0.0' },
    });
    if (initialized.protocolVersion !== '2025-06-18') throw new Error('Unsupported negotiated MCP protocol');
    if (!initialized.protocolVersion || !initialized.serverInfo?.name || !initialized.capabilities?.tools) throw new Error('MCP initialization missing server/tool capability');
    send({ method: 'notifications/initialized' });
    const tools = [];
    let cursor;
    const cursors = new Set();
    do {
      const page = await request('tools/list', cursor ? { cursor } : {});
      if (!Array.isArray(page.tools)) throw new Error('MCP tools/list is not an array');
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor)) throw new Error('MCP pagination repeats a cursor');
      if (cursor) cursors.add(cursor);
      if (cursors.size > 100) throw new Error('MCP tools/list exceeded 100 pages');
    } while (cursor);
    if (!tools.length || tools.some(t => !t.name || t.inputSchema?.type !== 'object')) throw new Error('MCP has no tools or invalid tool schemas');
    const results = [];
    for (const call of calls) {
      if (!tools.some(t => t.name === call.name)) throw new Error(`Missing tool: ${call.name}`);
      const result = await request('tools/call', call);
      if (result.isError) throw new Error(`Tool ${call.name} failed: ${JSON.stringify(result)}`);
      results.push(result);
    }
    return { server: initialized.serverInfo, protocol: initialized.protocolVersion, tools: tools.map(t => t.name), results };
  } finally {
    fail(new Error('MCP probe closed'));
    // Kill only our process group, including npx children; never name-match processes.
    if (child.pid) {
      const stop = signal => {
        try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      };
      stop('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 100));
      stop('SIGKILL');
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, cwd] = process.argv.slice(2);
  if (!file) { console.error('Usage: node scripts/check-mcp.js <server.json> [project-directory]'); process.exitCode = 1; }
  else {
    try { console.log(JSON.stringify(await checkMcp(JSON.parse(readFileSync(file, 'utf8')), { cwd }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
