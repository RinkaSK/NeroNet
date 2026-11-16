// Probe the configured chat-only MCP entrypoint; no write action is executed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config.json'), 'utf8'));
const endpoint = String(cfg.onebot?.httpUrl || 'http://127.0.0.1:3000/').replace(/\/?$/, '/');
const token = cfg.onebot?.accessToken || '';

const mcpEntry = fileURLToPath(new URL('../src/mcp-onebot-safe.js', import.meta.url));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [mcpEntry],
  env: { ...process.env }
});

const client = new Client({ name: 'bridge-test', version: '0.1.0' });
try {
  await client.connect(transport);
  console.log('✅ MCP 连接成功');

  const tools = await client.listTools();
  console.log(`✅ tools/list: ${tools.tools.length} 个工具`);
  const names = tools.tools.map((t) => t.name);
  console.log('   ', names.join(', '));
  const hasQuery = names.includes('qq_status');
  const hasInvoke = names.includes('qq_send_message');
  console.log(hasQuery ? '✅ qq_status 可用' : '❌ 缺 qq_status');
  console.log(hasInvoke ? '✅ qq_send_message 可用（write 模式）' : '❌ 缺 qq_send_message');

  if (hasQuery) {
    const result = await client.callTool({ name: 'qq_status', arguments: {} });
    console.log('✅ qq_status(get_login_info):', JSON.stringify(result).slice(0, 300));
  }
  if (!hasQuery || !hasInvoke) throw new Error('Required chat tools missing');
  await client.close();
} catch (error) {
  console.error('❌ MCP 测试失败:', error?.message ?? error);
  process.exit(1);
}
