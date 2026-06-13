#!/usr/bin/env node
/**
 * harness 自学习闭环测试（G 层核心完善）。
 *
 * 验证补丁不再「只存不消费」，而是真正进入 agent 的输出链路：
 *   1. 注入一个 pending harness 补丁 + 真实 LLM 配置
 *   2. 发 idea.submit
 *   3. 断言 A：gadget 的 bg-log 打印「应用自学习提示」→ 证明补丁被注入了 system prompt
 *   4. 断言 B：该补丁 status 变成 'applied' → 证明消费闭环收尾
 *
 * 凭据来源同 e2e-live-model.mjs（../Virtuea/.env，不入 git）。需真实 LLM（mock 分支不注入）。
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const EXT = join(ROOT, '.output/chrome-mv3').replace(/\\/g, '/');
const PROFILE = join(ROOT, '.test-profile-harness');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VIRTUEA_ENV = join(ROOT, '..', 'Virtuea', '.env');

if (!existsSync(EXT)) { console.error(`❌ 找不到 ${EXT}，请先 npm run build`); process.exit(1); }

// 凭据
const env = { ...process.env };
if (!env.MINIMAX_API_KEY && existsSync(VIRTUEA_ENV)) {
  for (const line of readFileSync(VIRTUEA_ENV, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
if (!env.MINIMAX_API_KEY) {
  console.error('❌ 缺少 MINIMAX_API_KEY（需真实 LLM 才能验证补丁注入）');
  process.exit(1);
}
const MODEL = env.MINIMAX_TEXT_MODEL || 'MiniMax-M3';
const ENDPOINT = env.MINIMAX_API_BASE_URL || 'https://api.minimaxi.com/anthropic';
console.log(`✅ 凭据已加载 | LLM: ${MODEL}`);

// 注入：真实配置 + 一个 pending 补丁
const PATCH_AFTER = '先聚焦一个最强产品方向，再补充一个保守备选';
const SEED = {
  runtimeConfig: {
    agentName: 'PocketAgent', defaultTone: 'warm-product-designer', avatarId: 'yunyu-main',
    maxSelectionChars: 280, maxMainTextChars: 3000, maxPageExcerptChars: 500,
    futurePermissionMode: 'all_urls-dev',
    llmProvider: 'minimax', llmModel: MODEL, llmApiKey: env.MINIMAX_API_KEY, llmEndpoint: ENDPOINT,
    imageMode: 'mock', imageModel: 'gpt-image-2',
    imageProxyEndpoint: 'https://api.apimart.ai/v1/images/generations', imageApiKey: '',
  },
  harnessPatches: [{
    id: 'patch-test-1', target: 'prompt', scope: 'runtime-config',
    reason: '测试用补丁：验证自学习闭环', before: '默认发散',
    after: PATCH_AFTER, riskLevel: 'low', requireUserApproval: true,
    status: 'pending', createdAt: 1700000000000,
  }],
  profile: {
    visualLikes: ['蓝白线条', '口袋感'], visualDislikes: [],
    tonePreference: '温暖、直接、产品化', productPreferences: ['轻量工具'],
    recentThemes: [], lastUpdated: 1700000000000,
  },
};

if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: [`--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

let sw = null;
for (let i = 0; i < 40; i++) {
  sw = browser.targets().find((t) => { try { return t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'); } catch { return false; } });
  if (sw) break; await wait(500);
}
const extId = new URL(sw.url()).host;
const swClient = await sw.createCDPSession();
await swClient.send('Runtime.enable');
await swClient.send('Console.enable');

// 收集 bg-log
const logs = [];
swClient.on('Console.messageAdded', (msg) => logs.push(msg.message.text));

// 注入 seed
await swClient.send('Runtime.evaluate', {
  expression: `(async () => { await chrome.storage.local.set(${JSON.stringify(SEED)}); return 'ok'; })()`,
  returnByValue: true, awaitPromise: true,
});
console.log('✅ 已注入：真实 LLM 配置 + 1 个 pending 补丁');

const sidePanel = await browser.newPage();
await sidePanel.goto(`chrome-extension://${extId}/sidepanel.html`);
await wait(1500);
sidePanel.setDefaultTimeout(60000);

const res = await sidePanel.evaluate(() => new Promise((resolve) => {
  chrome.runtime.sendMessage(
    { type: 'idea.submit', requestId: 'harness-1', source: 'popup', payload: { text: '做一个读书笔记整理工具', selectedContextIds: [], selectedArchiveNoteIds: [] } },
    (resp) => resolve(resp ? { success: resp.success, error: resp.error, name: resp.payload?.artifact?.concept?.name } : { success: false, error: chrome.runtime.lastError?.message }),
  );
}));
console.log('\n=== idea.submit ===');
console.log('success:', res.success, '| concept:', res.name);
if (!res.success) { console.error('❌', res.error); await browser.close(); process.exit(1); }

// 查补丁状态
const patchState = await swClient.send('Runtime.evaluate', {
  expression: `(async () => (await chrome.storage.local.get('harnessPatches')).harnessPatches[0]?.status)()`,
  returnByValue: true, awaitPromise: true,
});

await wait(500); // 等 bg-log 刷入
await browser.close();

// 断言
const A = logs.some((l) => l.includes('应用自学习提示'));
const B = patchState.result.value === 'applied';
console.log('\n=== 闭环断言 ===');
console.log(`A 补丁注入 system（bg-log「应用自学习提示」）: ${A ? '✅' : '❌'}`);
console.log(`B 补丁 status → applied（消费闭环收尾）      : ${B ? '✅' : '❌'} (实际=${patchState.result.value})`);
if (A) console.log('   相关日志:', logs.filter((l) => l.includes('自学习')).slice(0, 2));

const pass = A && B;
console.log(pass ? '\n🎉 harness 自学习闭环验证通过：补丁真正影响了下次输出。' : '\n⚠️ 闭环未完整，见上。');
process.exit(pass ? 0 : 1);
