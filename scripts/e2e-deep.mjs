#!/usr/bin/env node
/**
 * 终极测试：模拟"老标签页"场景——
 * 1. 先打开网页（让静态注入触发），让 content script 真的注册
 * 2. 移除 content script（用 chrome.scripting.executeScript 强行覆盖）
 *    实际做不到（静态注入是浏览器层面的），所以用另一种方法：
 * 3. 在 SW 里直接用 func 模式注入一个最小桥接，验证 func 注入能立即生效
 *
 * 这条路径就是 ensureContentScriptInjected 走 func 注入的同款逻辑
 */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const EXT = join(ROOT, '.output/chrome-mv3').replace(/\\/g, '/');
const PROFILE = join(ROOT, '.test-profile-final-deep');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html>
<html><head><title>Final Test Page</title></head>
<body><article>
  <h1>最终测试</h1>
  <p>${'这是测试用的内容。'.repeat(30)}</p>
</article></body></html>`);
});
await new Promise(r => server.listen(7811, '127.0.0.1', r));
console.log('✅ HTTP 服务: http://127.0.0.1:7811');

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
for (let i = 0; i < 30; i++) {
  swTarget = browser.targets().find(t => {
    try { return t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'); } catch { return false; }
  });
  if (swTarget) break;
  await wait(500);
}
const extId = new URL(swTarget.url()).host;

const swClient = await swTarget.createCDPSession();
await swClient.send('Runtime.enable');
await swClient.send('Console.enable');
swClient.on('Console.messageAdded', (msg) => {
  console.log(`  [bg-log] ${msg.message.text}`);
});

// 1. 打开测试页
const webPage = await browser.newPage();
await webPage.goto('http://127.0.0.1:7811/test');
await wait(2500);

// 2. 模拟"老标签页"——直接走完整的 page.readCurrent 流程
const sidePanel = await browser.newPage();
await sidePanel.goto(`chrome-extension://${extId}/sidepanel.html`);
await wait(2000);

console.log('\n=== Test A: 静态注入路径 ===');
const a = await sidePanel.evaluate(async () => {
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'page.readCurrent', requestId: 'a', source: 'popup', payload: { mode: 'current-page' } },
      (resp) => resolve({
        success: resp?.success, error: resp?.error,
        title: resp?.payload?.page?.pageTitle, textLen: resp?.payload?.page?.mainText?.length,
      }),
    );
  });
});
console.log(JSON.stringify(a, null, 2));

// 3. 真正的关键：手动移除 content script 模拟"老标签页"
console.log('\n=== Test B: 模拟老标签页（用 func 模式注入桥接）===');
// 思路：拿一个 web tab，先 PING 看 content script 在
// 然后用 chrome.scripting.executeScript({func: ...}) 注入一个最小桥接（覆盖之前的）
// 然后再 PING 一次
const b = await swClient.send('Runtime.evaluate', {
  expression: `(async () => {
    const tabs = await chrome.tabs.query({});
    const webTab = tabs.find(t => t.url?.includes('127.0.0.1:7811'));
    if (!webTab) return { error: 'no web tab' };

    // 先 PING 看看原始 content script 是否在线
    let pingBefore;
    try {
      await chrome.tabs.sendMessage(webTab.id, { type: 'content.ping' });
      pingBefore = { ok: true };
    } catch (e) {
      pingBefore = { ok: false, err: String(e) };
    }

    // 注入一个最小桥接脚本（用 func 模式）
    // 这个脚本只做一件事：注册 onMessage 监听 PING
    const result = await chrome.scripting.executeScript({
      target: { tabId: webTab.id },
      world: 'ISOLATED',
      func: () => {
        if (window.__pbTestBridge) return 'duplicate';
        window.__pbTestBridge = true;
        const c = (globalThis.chrome ?? globalThis.browser);
        c.runtime.onMessage.addListener((m, s, cb) => {
          if (m?.type === 'content.ping') {
            cb({ pong: true, via: 'func-bridge' });
            return false;
          }
          if (m?.type === 'content.page.extract-current') {
            cb({
              id: crypto.randomUUID(),
              mode: m.mode,
              origin: location.origin,
              pageTitle: document.title,
              pageType: 'generic',
              headings: [],
              mainText: '通过 func 桥接提取的内容',
              visibleTextSummary: '通过 func 桥接提取的内容',
              textExcerpt: '通过 func 桥接提取的内容',
              createdAt: Date.now(),
            });
            return false;
          }
          return false;
        });
        return 'injected';
      },
    });

    // 立刻 PING（func 模式同步执行，应该立即生效）
    const pingAfter = await new Promise((resolve) => {
      chrome.tabs.sendMessage(webTab.id, { type: 'content.ping' }, (resp) => {
        resolve({ resp, runtimeLastError: chrome.runtime.lastError?.message });
      });
    });

    // 测完整 extract
    const extract = await new Promise((resolve) => {
      chrome.tabs.sendMessage(webTab.id, { type: 'content.page.extract-current', mode: 'current-page' }, (resp) => {
        resolve({ resp, runtimeLastError: chrome.runtime.lastError?.message });
      });
    });

    return { pingBefore, execResult: result, pingAfter, extract };
  })()`,
  returnByValue: true, awaitPromise: true, timeout: 15000,
});
console.log(JSON.stringify(b.result.value, null, 2));

server.close();
await browser.close();