import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMcp } from '../scripts/check-mcp.js';

function server(mode) {
  return { command: process.execPath, args: ['--input-type=module', '-e', `
    import readline from 'node:readline';
    const mode = ${JSON.stringify(mode)};
    let ready = false;
    readline.createInterface({ input: process.stdin }).on('line', line => {
      const req = JSON.parse(line);
      if (mode === 'timeout') return;
      if (mode === 'exit') process.exit(2);
      if (mode === 'garbage') { console.log('not JSON'); return; }
      if (req.method === 'notifications/initialized') { ready = true; return; }
      let result;
      if (req.method === 'initialize') result = { protocolVersion: mode === 'protocol' ? 'unknown' : '2025-06-18', serverInfo: { name: 'fixture', version: '1' }, capabilities: { tools: {} } };
      else if (req.method === 'tools/list') {
        if (!ready) process.exit(3);
        result = { tools: mode === 'empty' ? [] : [{ name: 'probe', inputSchema: { type: 'object' } }] };
        if (mode === 'pagination' && !req.params.cursor) result = { tools: [], nextCursor: 'next' };
        if (mode === 'cycle') result.nextCursor = 'next';
      } else result = { content: [{ type: 'text', text: 'ok' }], isError: mode === 'toolError' };
      console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
    });
  `] };
}

test('MCP waits for initialize, paginates tool discovery, and executes a tool', async () => {
  const r = await checkMcp(server('pagination'), { calls: [{ name: 'probe', arguments: {} }] });
  assert.deepEqual(r.tools, ['probe']);
  assert.equal(r.results[0].content[0].text, 'ok');
});
for (const [mode, error] of [['protocol', /Unsupported negotiated/], ['empty', /no tools/], ['cycle', /repeats/], ['garbage', /non-JSON/], ['exit', /exited/], ['timeout', /timed out/], ['toolError', /failed/]]) {
  test(`MCP fails closed on ${mode}`, async () => {
    await assert.rejects(checkMcp(server(mode), { timeout: mode === 'timeout' ? 100 : 3000, calls: [{ name: 'probe', arguments: {} }] }), error);
  });
}
test('MCP spawn failure is reported', async () => {
  await assert.rejects(checkMcp({ command: '/missing-qa-ai-executable', args: [] }), /ENOENT/);
});
