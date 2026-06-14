#!/usr/bin/env node
/**
 * 页面分析 LLM 链路测试（F 层补缺：喂养链路接真智能）。
 *
 * 启动本地伪论文页 → content script 提取 → page.analyzeCurrent 走真实 LLM → 断言：
 *   A：analyzeCurrent 成功
 *   B：pageSummary 非模板（不含 buildSummary 的固定句式标记）
 *   C：真读正文（pageSummary/keyIdeas 含正文主题词"多模态"）
 *
 * 凭据来源同 e2e-live-model.mjs（../Virtuea/.env）。
 */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const EXT = join(ROOT, '.output/chrome-mv3').replace(/\\/g, '/');
const PROFILE = join(ROOT, '.test-profile-page');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VIRTUEA_ENV = join(ROOT, '..', 'Virtuea', '.env');
const BUNDLED_RUNTIME_CONFIG_FILE = join(ROOT, 'config', 'bundled-runtime-config.json');

if (!existsSync(EXT)) { console.error(`❌ 找不到 ${EXT}，请先 npm run build`); process.exit(1); }

const bundledRuntimeConfig = JSON.parse(readFileSync(BUNDLED_RUNTIME_CONFIG_FILE, 'utf8'));

const env = { ...process.env };
if (!env.MINIMAX_API_KEY && existsSync(VIRTUEA_ENV)) {
  for (const line of readFileSync(VIRTUEA_ENV, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const llmProfile = getActiveProfile(bundledRuntimeConfig.llmProfiles, bundledRuntimeConfig.activeLlmProfileId);
const MODEL = env.MINIMAX_TEXT_MODEL || llmProfile?.model || 'MiniMax-M3';
const ENDPOINT = env.MINIMAX_API_BASE_URL || llmProfile?.endpoint || 'https://api.minimaxi.com/anthropic';
const API_KEY = env.MINIMAX_API_KEY || llmProfile?.apiKey;
if (!API_KEY) { console.error('❌ 缺少 LLM API Key'); process.exit(1); }
console.log(`✅ 凭据已加载 | LLM: ${MODEL}`);

// 伪论文页：主题词"多模态"反复出现，有明确 problem/method/conclusion
const PAPER_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>多模态融合学习研究</title></head>
<body><article>
  <h1>多模态融合学习：一种新的对齐框架</h1>
  <h2>摘要</h2><p>本文提出一种多模态融合学习方法，解决图像与文本对齐时的语义鸿沟问题。我们设计了跨模态注意力机制。</p>
  <h2>问题</h2><p>现有多模态模型在图文细粒度对齐上存在语义鸿沟，导致检索准确率受限。</p>
  <h2>方法</h2><p>我们提出跨模态注意力网络 CMAN，通过双流编码器对齐图像区域与文本 token，训练采用对比学习损失。</p>
  <h2>实验</h2><p>在 MSCOCO 数据集上 CMAN 的检索 R@1 提升 8.3%，消融实验证明注意力机制是关键。</p>
  <h2>结论</h2><p>跨模态注意力有效缩小语义鸿沟，为多模态理解提供新路径。</p>
</article></body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAPER_HTML);
});
await new Promise((r) => server.listen(7822, '127.0.0.1', r));
console.log('✅ 伪论文页: http://127.0.0.1:7822/paper');

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

// 注入真实 LLM 配置
await swClient.send('Runtime.evaluate', {
  expression: `(async () => { await chrome.storage.local.set({ runtimeConfig: ${JSON.stringify({
    ...bundledRuntimeConfig,
    llmProfiles: [{ id: 'llm-test', name: '测试模型', apiKey: API_KEY, endpoint: ENDPOINT, model: MODEL }],
    activeLlmProfileId: 'llm-test',
    imageProfiles: [], activeImageProfileId: null,
  })} }); return 'ok'; })()`,
  returnByValue: true, awaitPromise: true,
});

// 打开伪论文页（content script 注入提取）
const webPage = await browser.newPage();
await webPage.goto('http://127.0.0.1:7822/paper');
await wait(2500);

const sidePanel = await browser.newPage();
await sidePanel.goto(`chrome-extension://${extId}/sidepanel.html`);
await wait(1500);
sidePanel.setDefaultTimeout(60000);

const res = await sidePanel.evaluate(() => new Promise((resolve) => {
  chrome.runtime.sendMessage(
    { type: 'page.analyzeCurrent', requestId: 'page-1', source: 'popup', payload: { mode: 'study-archive' } },
    (resp) => resolve(resp ? {
      success: resp.success, error: resp.error,
      pageType: resp.payload?.analysis?.pageType,
      pageSummary: resp.payload?.analysis?.pageSummary,
      keyIdeas: resp.payload?.analysis?.keyIdeas,
      noteTitle: resp.payload?.analysis?.noteCard?.title,
    } : { success: false, error: chrome.runtime.lastError?.message }),
  );
}));

server.close();
await wait(300);
await browser.close();

console.log('\n=== page.analyzeCurrent ===');
console.log('success:', res.success, '| pageType:', res.pageType);
if (!res.success) { console.error('❌', res.error); process.exit(1); }
console.log('  pageSummary:', String(res.pageSummary ?? '').slice(0, 140));
console.log('  keyIdeas:', JSON.stringify(res.keyIdeas));
console.log('  noteCard.title:', res.noteTitle);

const TEMPLATE_MARKS = ['更像一篇论文或研究摘要', '更像一篇结构化文章', '可以被当作一个通用知识片段'];
const A = res.success;
const B = !TEMPLATE_MARKS.some((m) => String(res.pageSummary ?? '').includes(m));
const C = /多模态|跨模态|CMAN/.test(String(`${res.pageSummary ?? ''} ${(res.keyIdeas ?? []).join(' ')}`));

console.log('\n=== 断言 ===');
console.log(`A analyzeCurrent 成功: ${A ? '✅' : '❌'}`);
console.log(`B pageSummary 非模板: ${B ? '✅' : '❌'}`);
console.log(`C 真读正文(含"多模态"): ${C ? '✅' : '❌'}`);

const pass = A && B && C;
console.log(pass ? '\n🎉 页面分析 LLM 链路通过：喂养链路已具备真智能（与 idea 链路对称）。' : '\n⚠️ 未完全通过。');
process.exit(pass ? 0 : 1);

function getActiveProfile(profiles, activeProfileId) {
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  return profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
}
