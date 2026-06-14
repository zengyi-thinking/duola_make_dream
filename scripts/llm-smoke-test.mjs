#!/usr/bin/env node
/**
 * 真实 LLM 冒烟测试：直接 fetch MiniMax/Anthropic 兼容 endpoint，验证 key 可用。
 *
 * 纯 node 脚本，不依赖扩展环境。读 config/local-runtime-config.json（inject 生成的本地副本）。
 * 消耗极少量 token（一个 max_tokens=64 的请求）。
 *
 * 用法：node scripts/llm-smoke-test.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '..', 'config', 'local-runtime-config.json');

let cfg;
try {
  cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch {
  console.error('❌ 读不到 config/local-runtime-config.json，请先运行: node scripts/inject-dev-config.mjs');
  process.exit(1);
}

const llm = cfg.llm || {};
if (!llm.apiKey || !llm.endpoint || !llm.model) {
  console.error('❌ LLM 配置不完整（endpoint/model/apiKey 任一为空）');
  console.error('   请确认 .env 变量名（支持 LLM_*/MINIMAX_*/ANTHROPIC_*）后重跑 inject');
  process.exit(1);
}

const url = `${llm.endpoint.replace(/\/$/, '')}/v1/messages`;
const body = {
  model: llm.model,
  max_tokens: 64,
  system: '你是一个简洁的助手，用一句话中文回答。',
  messages: [{ role: 'user', content: '请用一句话介绍你自己（不超过20字）' }],
};

console.log('🧪 真实 LLM 冒烟测试');
console.log('   endpoint:', llm.endpoint);
console.log('   model:   ', llm.model);
console.log('   apiKey:  已隐藏 (长度 ' + llm.apiKey.length + ')\n');

const start = Date.now();
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': llm.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timer);
  const latency = Date.now() - start;

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.log(`❌ HTTP ${res.status} (${latency}ms)`);
    console.log('   响应:', errText.slice(0, 400));
    console.log('\n排查: 401=key 错误, 404=endpoint 错误, 400=请求格式/model 名错误');
    process.exit(1);
  }

  const data = await res.json();
  const text = data.content?.filter((c) => c.type === 'text').map((c) => c.text).join('')
    || data.choices?.[0]?.message?.content
    || '';
  console.log(`✅ HTTP 200 (${latency}ms)`);
  console.log('   模型返回:', text.slice(0, 120) || '(空)');
  console.log('\n✅ 真实 LLM 链路可用 —— 发明/喂养链路将走真实模型');
} catch (err) {
  clearTimeout(timer);
  const aborted = err.name === 'AbortError';
  console.error('❌ 请求失败:', aborted ? `超时 (>30s)` : err.message);
  process.exit(1);
}
