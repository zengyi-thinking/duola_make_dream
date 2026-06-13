#!/usr/bin/env node
/**
 * 严格测试 ensureContentScriptInjected 的动态注入路径：
 * - 打开 sidepanel + 普通网页（用户真实路径）
 * - 验证：readCurrent 成功（不论是静态注入还是动态注入）
 * - 验证：错误消息友好（即使失败）
 */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const EXT = join(ROOT, '.output/chrome-mv3').replace(/\\/g, '/');
const PROFILE = join(ROOT, '.test-profile-final');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

const TEST_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Real User Flow</title></head>
<body><article>
  <h1>用户真实场景测试</h1>
  <p>${'这是一段用于测试的段落，确保 mainText 超过 200 字符。'.repeat(20)}</p>
</article></body></html>`;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(TEST_HTML);
});
await new Promise(r => server.listen(7802, '127.0.0.1', r));
console.log('✅ HTTP 服务: http://127.0.0.1:7802');

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
console.log('SW extId:', extId);

// 场景：用户先打开 sidepanel（在某些浏览器里这会触发 SW 启动），
// 然后打开一个网页，再触发 page.readCurrent
// 这正是会触发 content script 没注册的"老标签页"场景
const sidePanel = await browser.newPage();
await sidePanel.goto(`chrome-extension://${extId}/sidepanel.html`);
await wait(2000);

const webPage = await browser.newPage();
await webPage.goto('http://127.0.0.1:7802/test');
await wait(2500);

console.log('\n=== 🚨 完整用户路径：sidepanel → page.readCurrent ===');
const readResult = await sidePanel.evaluate(async () => {
  return await new Promise((resolve) => {
    const startTime = Date.now();
    chrome.runtime.sendMessage(
      { type: 'page.readCurrent', requestId: 'user-flow-1', source: 'popup', payload: { mode: 'current-page' } },
      (resp) => {
        resolve({
          elapsedMs: Date.now() - startTime,
          resp: resp ? {
            success: resp.success,
            error: resp.error,
            title: resp.payload?.page?.pageTitle,
            textLen: resp.payload?.page?.mainText?.length,
          } : null,
          runtimeLastError: chrome.runtime.lastError?.message,
        });
      },
    );
  });
});
console.log(JSON.stringify(readResult, null, 2));

// 再做一次 analyze
console.log('\n=== 🚨 analyzeCurrent ===');
const analyzeResult = await sidePanel.evaluate(async () => {
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'page.analyzeCurrent', requestId: 'user-flow-2', source: 'popup', payload: { mode: 'study-archive' } },
      (resp) => {
        resolve({
          resp: resp ? {
            success: resp.success,
            error: resp.error,
            noteTitle: resp.payload?.analysis?.noteCard?.title,
            memoryCandidates: resp.payload?.analysis?.memoryCandidates?.length,
          } : null,
          runtimeLastError: chrome.runtime.lastError?.message,
        });
      },
    );
  });
});
console.log(JSON.stringify(analyzeResult, null, 2));

server.close();
await browser.close();