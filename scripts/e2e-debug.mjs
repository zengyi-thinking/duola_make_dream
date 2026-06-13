#!/usr/bin/env node
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const EXT = join(ROOT, '.output/chrome-mv3').replace(/\\/g, '/');
const PROFILE = join(ROOT, '.test-profile-debug');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

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

const swClient = await swTarget.createCDPSession();
await swClient.send('Runtime.enable');

// 在 sidepanel 还没打开前，先开 example.com → 此时 SW 应该看到它
const webPage = await browser.newPage();
await webPage.goto('https://example.com/');
await wait(2000);

const tabsAfterWeb = await swClient.send('Runtime.evaluate', {
  expression: `(async () => (await chrome.tabs.query({})).map(t => ({ id: t.id, url: t.url, active: t.active, windowType: t.windowType })))()`,
  returnByValue: true, awaitPromise: true,
});
console.log('开 example.com 后的 tabs:', JSON.stringify(tabsAfterWeb.result.value, null, 2));

await browser.close();