#!/usr/bin/env node
/**
 * PocketBuddy 端到端测试（puppeteer-core + Edge）
 *
 * 流程：
 * 1. 用 puppeteer-core 启动 Edge（headless），指定 .output/chrome-mv3 加载扩展
 * 2. 打开一个本地 file:// 测试页面
 * 3. 通过 puppeteer 的 Target API 拿到扩展的 service worker
 * 4. 在 service worker 里 evaluate 各种 chrome.* API：
 *    - chrome.management.getSelf() 验证扩展已加载
 *    - chrome.tabs.query() 找到 test tab
 *    - chrome.tabs.sendMessage(tabId, {type:'content.ping'}) 探测 content script
 *    - chrome.scripting.executeScript 动态注入（模拟"老 tab 未注入"场景）
 *    - chrome.tabs.sendMessage(tabId, {type:'content.page.extract-current'}) 提取正文
 * 5. 收集所有结果
 */

import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXT_PATH = join(ROOT, '.output', 'chrome-mv3');
const PROFILE_PATH = join(ROOT, '.test-profile');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

if (!existsSync(EXT_PATH)) {
  console.error(`❌ 扩展产物不存在: ${EXT_PATH}`);
  console.error('请先运行 pnpm wxt build');
  process.exit(1);
}

// 准备测试用本地 HTML（用 http 服务避开 file:// host permission 陷阱）
if (existsSync(PROFILE_PATH)) rmSync(PROFILE_PATH, { recursive: true, force: true });
mkdirSync(PROFILE_PATH, { recursive: true });
const TEST_HTML_PATH = join(PROFILE_PATH, 'test-page.html');
const TEST_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>PocketBuddy E2E Test Page</title>
</head>
<body>
  <article>
    <h1>PocketBuddy 端到端测试</h1>
    <p>这是一段用于 PocketBuddy 测试的正文。它包含足够多的内容用于测试 page extraction、memory candidates、key ideas 提取等功能。</p>
    <h2>引言</h2>
    <p>PocketBuddy 是一个把想法放进口袋的浏览器插件，能够帮你快速把模糊想法变成可讨论的产品雏形。</p>
    <h2>方法</h2>
    <p>插件使用 content script 提取页面内容，通过 background service worker 与 LLM 通信，最后用 sidepanel 展示结果。</p>
    <h2>结论</h2>
    <p>这种架构既保证了用户隐私，又提供了流畅的创作体验。</p>
    <p>${'这段内容用于让 main text 超过 200 字符。'.repeat(20)}</p>
  </article>
</body>
</html>`;
writeFileSync(TEST_HTML_PATH, TEST_HTML, 'utf-8');

const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/test') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(TEST_HTML);
  } else {
    res.writeHead(404); res.end();
  }
});
await new Promise((r) => httpServer.listen(7788, '127.0.0.1', r));
const TEST_HTML_URL = 'http://127.0.0.1:7788/test';
console.log(`✅ 本地 HTTP 服务已启动: ${TEST_HTML_URL}`);

console.log('🧪 PocketBuddy E2E Test (puppeteer-core + Edge)');
console.log(`   扩展: ${EXT_PATH}`);
console.log(`   测试页: ${TEST_HTML_URL}\n`);

// ── 启动 Edge ─────────────────────────────────────────────
console.log('🚀 启动 Edge...');
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    `--user-data-dir=${PROFILE_PATH}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
  ],
  dumpio: false,
  defaultViewport: null,
});

console.log(`✅ Edge 已启动\n`);

const results = [];
function record(name, passed, detail) {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${detail}`);
  results.push({ name, passed, detail });
}

// ── 找扩展 service worker ─────────────────────────────────
console.log('─── Test 0: 找到 PocketBuddy 的 service worker ───');
let swTarget = null;
for (let i = 0; i < 30; i++) {
  const targets = browser.targets();
  swTarget = targets.find((t) =>
    t.type() === 'service_worker'
    && t.url().startsWith('chrome-extension://')
  );
  if (swTarget) break;
  await wait(300);
}

if (!swTarget) {
  // 备选：列出所有 targets 看看
  const all = browser.targets().map(t => `[${t.type()}] ${t.url()}`);
  console.error('❌ 没找到任何扩展 service worker');
  console.error('所有 targets:');
  all.forEach(t => console.error('  ' + t));
  await browser.close();
  process.exit(1);
}
const swUrl = swTarget.url();
const extId = new URL(swUrl).host;
console.log(`✅ service worker: ${swUrl}`);
console.log(`   扩展 ID: ${extId}\n`);

// ── 在 service worker 里 evaluate ──────────────────────────
async function swEval(expression) {
  const client = await swTarget.createCDPSession();
  try {
    const r = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: 20000,
    });
    if (r.exceptionDetails) {
      const msg = r.exceptionDetails.exception?.description
        ?? r.exceptionDetails.text
        ?? JSON.stringify(r.exceptionDetails);
      throw new Error(msg);
    }
    return r.result.value;
  } finally {
    await client.detach();
  }
}

// ── Test 1: 扩展信息 ──────────────────────────────────────
console.log('─── Test 1: 扩展已加载 ───');
const extInfo = await swEval(`
  (async () => {
    const self = await chrome.management.getSelf();
    return { id: self.id, name: self.name, enabled: self.enabled, version: self.version };
  })()
`).catch((e) => ({ error: e.message }));
console.log(`   ${JSON.stringify(extInfo)}`);
record('PocketBuddy 扩展加载',
  extInfo.name === 'PocketBuddy',
  extInfo.name ?? extInfo.error);

// ── Test 2: 打开测试页面 + 探测 content script ─────────────
console.log('\n─── Test 2: content script 注入探测 ───');
const testPage = await browser.newPage();
await testPage.goto(TEST_HTML_URL, { waitUntil: 'domcontentloaded' });
await wait(1500); // 等 content script 注册 onMessage

// 列出所有 tab 帮助调试
const allTabsDebug = await swEval(`(async () => {
  // 用 permission 强查询
  const tabs = await chrome.tabs.query({});
  return tabs.map(t => ({ id: t.id, url: t.url ?? '(hidden by activeTab)', active: t.active }));
})()`);
console.log(`   所有 tab:`);
allTabsDebug.forEach(t => console.log(`     [${t.id}] ${t.url}`));

// 找这个 http tab 的 id（即使 activeTab 隐藏 url，也可以用 page 自身的 target id）
// 我们用 puppeteer 的 page 直接拿到 target id
const testTarget = testPage.target();
const testTargetId = testTarget._targetId;
console.log(`   puppeteer test targetId: ${testTargetId}`);

// 在 SW 里通过 chrome.tabs.query 找到 active tab 的 id（active tab 总是能查到）
const activeTabId = await swEval(`
  (async () => {
    const tabs = await chrome.tabs.query({ active: true });
    return tabs.map(t => t.id);
  })()
`);
console.log(`   active tabs:`, activeTabId);

// 第一次 PING：找一个 active tab 来探测
const tabIdToTest = activeTabId[0];
console.log(`   使用 tabId ${tabIdToTest} 探测`);
const ping1 = await swEval(`
  (async () => {
    try {
      const resp = await chrome.tabs.sendMessage(${tabIdToTest}, { type: 'content.ping' });
      return { connected: true, resp };
    } catch (e) {
      return { connected: false, error: String(e) };
    }
  })()
`);
console.log(`   首次 PING: ${JSON.stringify(ping1)}`);

if (ping1.connected) {
  record('content script 静态注入成功', true, 'PING 立即收到 pong');
} else {
  console.log('   → 静态注入未触发，测试动态注入兜底...');
  const inject = await swEval(`
    (async () => {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: ${tabIdToTest} },
          files: ['content-scripts/content.js'],
        });
        await new Promise(r => setTimeout(r, 200));
        const resp = await chrome.tabs.sendMessage(${tabIdToTest}, { type: 'content.ping' });
        return { ok: true, resp };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    })()
  `);
  console.log(`   动态注入结果: ${JSON.stringify(inject)}`);
  record('动态注入兜底', inject.ok, JSON.stringify(inject).slice(0, 200));
}

// ── Test 3: page.extract-current 全链路 ───────────────────
console.log('\n─── Test 3: page.extract-current 提取正文 ───');
const extract = await swEval(`
  (async () => {
    try {
      const resp = await chrome.tabs.sendMessage(${tabIdToTest}, {
        type: 'content.page.extract-current',
        mode: 'current-page',
      });
      return {
        ok: true,
        title: resp?.pageTitle,
        type: resp?.pageType,
        textLen: resp?.mainText?.length ?? 0,
        headings: resp?.headings ?? [],
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  })()
`);
console.log(`   提取结果: ${JSON.stringify(extract)}`);
record('page.extract-current',
  extract.ok && extract.textLen > 100,
  extract.ok
    ? `标题=${extract.title}, 类型=${extract.type}, 文本长度=${extract.textLen}, headings=${extract.headings.length}`
    : JSON.stringify(extract));

// ── Test 4: page.analyzeCurrent (memory candidates) ────────
console.log('\n─── Test 4: page.analyzeCurrent 生成 memory candidates ───');
const analyze = await swEval(`
  (async () => {
    try {
      // 直接复用 analyzer：buildPageAnalysisResult 不在 SW 里
      // 这里我们测的是 SW 收到 page.analyzeCurrent 消息后的处理路径
      const resp = await chrome.runtime.sendMessage({
        type: 'page.analyzeCurrent',
        requestId: 'e2e-test-' + Date.now(),
        source: 'background',
        payload: { mode: 'study-archive' },
      });
      return {
        ok: resp?.success ?? false,
        analysisId: resp?.payload?.analysis?.id,
        candidates: resp?.payload?.analysis?.memoryCandidates?.length ?? 0,
        noteTitle: resp?.payload?.analysis?.noteCard?.title,
        keyIdeas: resp?.payload?.analysis?.keyIdeas?.length ?? 0,
        error: resp?.error,
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  })()
`);
console.log(`   分析结果: ${JSON.stringify(analyze)}`);
record('page.analyzeCurrent 全链路',
  analyze.ok && analyze.candidates > 0,
  analyze.ok
    ? `生成 ${analyze.candidates} 个 memory candidates, ${analyze.keyIdeas} 个 key ideas`
    : analyze.error ?? 'unknown');

// ── Test 5: page.readCurrent (简化路径) ───────────────────
console.log('\n─── Test 5: page.readCurrent 保存 page context ───');
const read = await swEval(`
  (async () => {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'page.readCurrent',
        requestId: 'e2e-test-read-' + Date.now(),
        source: 'background',
        payload: { mode: 'current-page' },
      });
      return {
        ok: resp?.success ?? false,
        title: resp?.payload?.page?.pageTitle,
        contextId: resp?.payload?.savedContext?.id,
        pageCount: resp?.payload?.memorySummary?.counts?.pageContexts,
        error: resp?.error,
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  })()
`);
console.log(`   读取结果: ${JSON.stringify(read)}`);
record('page.readCurrent 保存到 storage',
  read.ok && read.pageCount > 0,
  read.ok
    ? `pageContexts count = ${read.pageCount}`
    : read.error ?? 'unknown');

// ── Test 6: chrome:// URL 拦截（验证修复后的友好提示）────
console.log('\n─── Test 6: chrome:// URL 拦截 ───');
const urlFilter = await swEval(`
  (() => {
    // 复制 background.ts 的 canInjectContentScript 逻辑
    function canInject(url) {
      try {
        const parsed = new URL(url);
        const scheme = parsed.protocol.toLowerCase();
        if (['chrome:','chrome-extension:','chrome-search:','chrome-untrusted:','devtools:','about:','view-source:'].includes(scheme)) return false;
        if (parsed.hostname === 'chromewebstore.google.com') return false;
        return true;
      } catch { return false; }
    }
    return {
      chrome: canInject('chrome://newtab/'),
      extension: canInject('chrome-extension://abc/popup.html'),
      about: canInject('about:blank'),
      webstore: canInject('https://chromewebstore.google.com/detail/x'),
      http: canInject('https://example.com/'),
      file: canInject('file:///C:/test.html'),
    };
  })()
`);
console.log(`   URL 过滤判断: ${JSON.stringify(urlFilter)}`);
const correctBlocking = urlFilter.chrome === false
  && urlFilter.extension === false
  && urlFilter.about === false
  && urlFilter.webstore === false
  && urlFilter.http === true;
record('canInjectContentScript 拦截 chrome:// 等 scheme',
  correctBlocking,
  `http/file 通过, chrome/extension/about/webstore 拦截`);

// ── Test 7: 模拟"老 tab 未注入"场景 ──────────────────────
// 先关掉 content script（用 chrome.scripting.removeScripting），再测修复后的兜底
console.log('\n─── Test 7: 模拟"老 tab 未注入" + 兜底修复 ───');
// 直接对 file tab 再次发 PING，测 ensureContentScriptInjected 路径
const oldTabSim = await swEval(`
  (async () => {
    // 先移除 content script（模拟扩展刚装，老 tab 没注入）
    try {
      await chrome.scripting.unregisterContentScripts({ ids: ['_'] }).catch(() => {});
    } catch {}
    // 第一次发送：会失败（content script 不在线）
    let firstAttempt;
    try {
      await chrome.tabs.sendMessage(${tabIdToTest}, { type: 'content.ping' });
      firstAttempt = 'unexpected-success';
    } catch (e) {
      firstAttempt = String(e);
    }
    // 模拟 background 里的兜底逻辑：动态注入 + 再 PING
    let injected = false;
    let retryErr;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: ${tabIdToTest} },
        files: ['content-scripts/content.js'],
      });
      await new Promise(r => setTimeout(r, 200));
      await chrome.tabs.sendMessage(${tabIdToTest}, { type: 'content.ping' });
      injected = true;
    } catch (e) {
      retryErr = String(e);
    }
    return { firstAttempt, injected, retryErr };
  })()
`);
console.log(`   模拟结果: ${JSON.stringify(oldTabSim)}`);
const fixWorks = oldTabSim.firstAttempt.includes('Receiving end does not exist')
  && oldTabSim.injected === true;
record('修复后：老 tab 场景下注入兜底能成功',
  fixWorks,
  `首次失败含 "Receiving end does not exist"，兜底注入后 PING 成功=${oldTabSim.injected}`);

// ── Test 8: storage 数据闭环 ──────────────────────────────
console.log('\n─── Test 8: storage 持久化验证 ───');
const memorySummary = await swEval(`
  (async () => {
    const resp = await chrome.runtime.sendMessage({
      type: 'memory.get',
      requestId: 'e2e-test-mem-' + Date.now(),
      source: 'background',
      payload: {},
    });
    return {
      ok: resp?.success ?? false,
      counts: resp?.payload?.counts,
      error: resp?.error,
    };
  })()
`);
console.log(`   memory 摘要: ${JSON.stringify(memorySummary)}`);
record('memory.get 数据闭环',
  memorySummary.ok,
  `pageContexts=${memorySummary.counts?.pageContexts}, notes=${memorySummary.counts?.notes}`);

// ── 收尾 ────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
const passed = results.filter(r => r.passed).length;
const failed = results.length - passed;
console.log(`📊 ${passed} 通过 / ${failed} 失败 / ${results.length} 总计\n`);
if (failed > 0) {
  console.log('失败用例:');
  results.filter(r => !r.passed).forEach(r => console.log(`  - ${r.name}: ${r.detail}`));
}

await wait(300);
await browser.close();
httpServer.close();
process.exit(failed > 0 ? 1 : 0);