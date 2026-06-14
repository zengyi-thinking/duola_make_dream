#!/usr/bin/env node
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const EXT = join(ROOT, '.output/chrome-mv3').replace(/\\/g, '/');
const PROFILE = join(ROOT, '.test-profile-final');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VIRTUEA_ENV = join(ROOT, '..', 'Virtuea', '.env');
const BUNDLED_RUNTIME_CONFIG_FILE = join(ROOT, 'config', 'bundled-runtime-config.json');

function getActiveProfile(profiles, activeProfileId) {
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  return profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
}

if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

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
if (!API_KEY) {
  console.error('❌ 缺少 LLM API Key（请检查 ../Virtuea/.env 或环境变量）');
  process.exit(1);
}
console.log(`✅ 凭据已加载 | LLM: ${MODEL}`);

// 准备测试页面
const TEST_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>PB Test Article</title></head>
<body><article>
  <h1>研究方法与产品机会</h1>
  <p>${'这是一个用于测试 PocketBuddy 页面提取的段落，包含足够多的内容。'.repeat(15)}</p>
  <h2>方法</h2><p>${'本文使用结构化提取的方式获取关键信息。'.repeat(8)}</p>
</article></body></html>`;

// 本地 HTTP 服务
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(TEST_HTML);
});
await new Promise(r => server.listen(7799, '127.0.0.1', r));
console.log('✅ 测试 HTTP 服务已启动: http://127.0.0.1:7799');

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    `--user-data-dir=${PROFILE}`,
    '--no-first-run','--no-default-browser-check','--disable-gpu',
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
  ],
});

let swTarget = null;
for (let i = 0; i < 120 && !swTarget; i++) {
  swTarget = browser.targets().find(t => {
    try { return t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'); } catch { return false; }
  });
  if (!swTarget) await wait(500);
}
if (!swTarget && typeof browser.waitForTarget === 'function') {
  try {
    swTarget = await browser.waitForTarget((t) => {
      try { return t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'); } catch { return false; }
    }, { timeout: 60000 });
  } catch {
    swTarget = null;
  }
}
if (!swTarget) {
  console.error('❌ service worker 未启动');
  console.error(browser.targets().map((t) => `[${t.type()}] ${t.url()}`).join('\n'));
  await browser.close();
  process.exit(1);
}
const extId = new URL(swTarget.url()).host;
console.log('SW extId:', extId);

const swClient = await swTarget.createCDPSession();
await swClient.send('Runtime.enable');
await swClient.send('Console.enable');
swClient.on('Console.messageAdded', (msg) => {
  console.log(`  [bg-log] ${msg.message.text}`);
});

await swClient.send('Runtime.evaluate', {
  expression: `(async () => {
    await chrome.storage.local.set({ runtimeConfig: ${JSON.stringify({
      ...bundledRuntimeConfig,
      llmProfiles: [{ id: 'llm-test', name: '测试模型', apiKey: API_KEY, endpoint: ENDPOINT, model: MODEL }],
      activeLlmProfileId: 'llm-test',
      imageProfiles: [],
      activeImageProfileId: null,
    })} });
    return 'ok';
  })()`,
  returnByValue: true,
  awaitPromise: true,
});

// 步骤 1：用户打开普通网页
const webPage = await browser.newPage();
await webPage.goto('http://127.0.0.1:7799/test');
await wait(2000);

const tabsAfterWeb = await swClient.send('Runtime.evaluate', {
  expression: `(async () => (await chrome.tabs.query({})).map(t => ({ id: t.id, url: t.url, active: t.active })))()`,
  returnByValue: true, awaitPromise: true,
});
console.log('\n开测试页后 tabs:', JSON.stringify(tabsAfterWeb.result.value, null, 2));

// 步骤 2：用户点击扩展图标打开 sidepanel
const sidePanel = await browser.newPage();
await sidePanel.goto(`chrome-extension://${extId}/sidepanel.html`);
await wait(2500);

// 步骤 3：从 sidepanel 触发 page.readCurrent
const readResult = await sidePanel.evaluate(async () => {
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'page.readCurrent', requestId: 'final-1', source: 'popup', payload: { mode: 'current-page' } },
      (resp) => {
        resolve({
          resp: resp ? {
            success: resp.success,
            error: resp.error,
            title: resp.payload?.page?.pageTitle,
            textLen: resp.payload?.page?.mainText?.length,
            pageContextsCount: resp.payload?.memorySummary?.counts?.pageContexts,
            pipelineRunsCount: resp.payload?.memorySummary?.counts?.pipelineRuns,
          } : null,
          runtimeLastError: chrome.runtime.lastError?.message,
        });
      },
    );
  });
});
console.log('\n=== 🚨 page.readCurrent 完整闭环 ===');
console.log(JSON.stringify(readResult, null, 2));

// 步骤 4：触发 page.analyzeCurrent
const analyzeResult = await sidePanel.evaluate(async () => {
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'page.analyzeCurrent', requestId: 'final-2', source: 'popup', payload: { mode: 'study-archive' } },
      (resp) => {
        resolve({
          resp: resp ? {
            success: resp.success,
            error: resp.error,
            noteTitle: resp.payload?.analysis?.noteCard?.title,
            keyIdeas: resp.payload?.analysis?.keyIdeas?.length,
            memoryCandidates: resp.payload?.analysis?.memoryCandidates?.length,
            pipelineRunsCount: resp.payload?.memorySummary?.counts?.pipelineRuns,
          } : null,
          runtimeLastError: chrome.runtime.lastError?.message,
        });
      },
    );
  });
});
console.log('\n=== 🚨 page.analyzeCurrent 完整闭环 ===');
console.log(JSON.stringify(analyzeResult, null, 2));

// 步骤 5：触发 idea.submit
const ideaResult = await sidePanel.evaluate(async () => {
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'idea.submit', requestId: 'final-3', source: 'popup', payload: { text: '做一个能自动整理阅读笔记的小工具', selectedContextIds: [], selectedArchiveNoteIds: [] } },
      (resp) => {
        resolve({
          resp: resp ? {
            success: resp.success,
            error: resp.error,
            artifactName: resp.payload?.artifact?.concept?.name,
            tagline: resp.payload?.artifact?.concept?.tagline,
            features: resp.payload?.artifact?.concept?.features?.length,
            pipelineRunsCount: resp.payload?.memorySummary?.counts?.pipelineRuns,
          } : null,
          runtimeLastError: chrome.runtime.lastError?.message,
        });
      },
    );
  });
});
console.log('\n=== 🚨 idea.submit 完整闭环 ===');
console.log(JSON.stringify(ideaResult, null, 2));

server.close();
await browser.close();
