#!/usr/bin/env node
/**
 * 阶段 1 真模型综合 smoke（对应 docs/pocketbuddy-execution-plan.md 阶段1验收）
 *
 * 一次性验证三件事：
 *   Part A：真实 LLM —— idea.submit 走 minimax，结果与输入语义相关（非模板固定值）
 *   Part B：真实生图 —— image.generate 走 apimart gpt-image-2，返回真实图片
 *   Part C：失败降级 —— 故意注入错误 key，验证不崩、优雅降级
 *
 * 凭据来源（安全约定）：
 *   优先 process.env.{MINIMAX_API_KEY, GPT_IMAGE_API_KEY}；
 *   否则读 ../Virtuea/.env（用户指定来源，不进 git、不进代码）。
 *   脚本本身不含任何明文 key。
 *
 * 用法：
 *   npm run build
 *   node scripts/e2e-live-model.mjs
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const EXT = join(ROOT, '.output/chrome-mv3').replace(/\\/g, '/');
const PROFILE = join(ROOT, '.test-profile-live');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const VIRTUEA_ENV = join(ROOT, '..', 'Virtuea', '.env');

if (!existsSync(EXT)) {
  console.error(`❌ 找不到构建产物 ${EXT}，请先执行 npm run build`);
  process.exit(1);
}

// ---------- 凭据加载 ----------
function loadCreds() {
  const env = { ...process.env };
  if ((!env.MINIMAX_API_KEY || !env.GPT_IMAGE_API_KEY) && existsSync(VIRTUEA_ENV)) {
    for (const line of readFileSync(VIRTUEA_ENV, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return {
    minimaxKey: env.MINIMAX_API_KEY,
    minimaxModel: env.MINIMAX_TEXT_MODEL || 'MiniMax-M3',
    minimaxEndpoint: env.MINIMAX_API_BASE_URL || 'https://api.minimaxi.com/anthropic',
    imageKey: env.GPT_IMAGE_API_KEY,
    imageModel: env.GPT_IMAGE_MODEL || 'gpt-image-2',
    imageEndpoint: env.GPT_IMAGE_API_URL || 'https://api.apimart.ai/v1/images/generations',
  };
}

const creds = loadCreds();
if (!creds.minimaxKey || !creds.imageKey) {
  console.error('❌ 缺少凭据。请设置环境变量，或确保 ../Virtuea/.env 存在且含：');
  console.error('   MINIMAX_API_KEY / GPT_IMAGE_API_KEY');
  console.error(`   尝试读取: ${VIRTUEA_ENV} -> ${existsSync(VIRTUEA_ENV) ? '存在' : '不存在'}`);
  process.exit(1);
}
console.log('✅ 凭据已加载（来源不打印）');
console.log(`   LLM:  ${creds.minimaxModel} @ ${creds.minimaxEndpoint}`);
console.log(`   图片: ${creds.imageModel} @ ${creds.imageEndpoint}`);

// ---------- runtimeConfig 构造 ----------
function buildConfig({ llmKey, imageKey }) {
  return {
    agentName: 'PocketAgent',
    defaultTone: 'warm-product-designer',
    avatarId: 'yunyu-main',
    maxSelectionChars: 280,
    maxMainTextChars: 3000,
    maxPageExcerptChars: 500,
    futurePermissionMode: 'all_urls-dev',
    llmProvider: 'minimax',
    llmModel: creds.minimaxModel,
    llmApiKey: llmKey,
    llmEndpoint: creds.minimaxEndpoint,
    imageMode: 'proxy',
    imageModel: creds.imageModel,
    imageProxyEndpoint: creds.imageEndpoint,
    imageApiKey: imageKey,
  };
}

// ---------- 启动浏览器 + 等 SW ----------
if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
  ],
});

let swTarget = null;
for (let i = 0; i < 40; i++) {
  swTarget = browser.targets().find((t) => {
    try { return t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'); } catch { return false; }
  });
  if (swTarget) break;
  await wait(500);
}
if (!swTarget) { console.error('❌ service worker 未启动'); await browser.close(); process.exit(1); }
const extId = new URL(swTarget.url()).host;
console.log('SW extId:', extId);

const swClient = await swTarget.createCDPSession();
await swClient.send('Runtime.enable');
await swClient.send('Console.enable');
swClient.on('Console.messageAdded', (msg) => console.log(`  [bg-log] ${msg.message.text}`));

// ---------- helpers ----------
async function injectConfig(config) {
  const r = await swClient.send('Runtime.evaluate', {
    expression: `(async () => {
      await chrome.storage.local.set({ runtimeConfig: ${JSON.stringify(config)} });
      const got = (await chrome.storage.local.get('runtimeConfig')).runtimeConfig;
      return { provider: got?.llmProvider, imageMode: got?.imageMode, model: got?.llmModel };
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  return r.result.value;
}

// sidepanel 页面用于发消息（与真实前端同源）
const sidePanel = await browser.newPage();
await sidePanel.goto(`chrome-extension://${extId}/sidepanel.html`);
await wait(2000);
// 图片为异步任务（2k 约 100s），把页面默认超时放宽，避免 evaluate 提前中断
sidePanel.setDefaultTimeout(240000);

async function send(type, payload) {
  return sidePanel.evaluate(async (t, p) => new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: t, requestId: 'live-' + Math.random().toString(36).slice(2), source: 'popup', payload: p },
      (resp) => resolve(resp
        ? { success: resp.success, error: resp.error, payload: resp.payload }
        : { success: false, error: chrome.runtime.lastError?.message ?? '无响应' }),
    );
  }), type, payload);
}

// ---------- 注入真实配置 ----------
console.log('\n=== 注入真实配置到 storage ===');
console.log(JSON.stringify(await injectConfig(buildConfig({ llmKey: creds.minimaxKey, imageKey: creds.imageKey })), null, 2));

// 模板特征（用于判定是否真实 LLM）—— 见 lib/agent/gadgets/idea-lens.ts buildTemplateConcept
const TEMPLATE_FEATURE = '一句话想法转产品概念';
const TEMPLATE_SUFFIXES = ['Pocket', 'Flow', 'Sketch', 'Loop', 'Joy'];
const results = { liveLlm: false, liveImage: false, degradeLlm: false, degradeImage: false };

// ===== Part A：真实 LLM =====
console.log('\n=== Part A: 真实 LLM (idea.submit) ===');
const ideaRes = await send('idea.submit', {
  text: '做一个能把任意网页一键变成知识卡片的浏览器插件，适合学生和研究者',
  selectedContextIds: [],
  selectedArchiveNoteIds: [],
});
const art = ideaRes.payload?.artifact;
console.log('success:', ideaRes.success);
if (ideaRes.success && art) {
  const name = String(art.concept?.name ?? '');
  console.log('  concept.name :', name);
  console.log('  tagline      :', String(art.concept?.tagline ?? '').slice(0, 60));
  console.log('  features[0]  :', String(art.concept?.features?.[0] ?? ''));
  console.log('  imagePrompt  :', String(art.imagePrompt ?? '').slice(0, 70));
  const nameIsTemplate = TEMPLATE_SUFFIXES.some((s) => name.endsWith(s));
  const featuresIsTemplate = art.concept?.features?.[0] === TEMPLATE_FEATURE;
  results.liveLlm = !nameIsTemplate && !featuresIsTemplate && name.length > 0;
  console.log(results.liveLlm ? '✅ 真实 LLM 返回（与输入语义相关，非模板）' : '⚠️ 返回疑似模板，请人工核对 name/features');
} else {
  console.log('❌ idea.submit 失败:', ideaRes.error);
}

// ===== Part B：真实生图 =====
console.log('\n=== Part B: 真实生图 (image.generate) ===');
const imgRes = await send('image.generate', {
  sourceType: 'idea',
  title: '网页知识卡片工具',
  content: '一个把任意网页一键转成知识卡片的浏览器插件，蓝白线条风格',
  style: 'product-ui',
});
const rec = imgRes.payload?.record;
console.log('success:', imgRes.success);
if (rec) {
  console.log('  status      :', rec.status);
  console.log('  previewText :', String(rec.previewText ?? '').slice(0, 80));
  console.log('  imageUrl    :', String(rec.imageUrl ?? '').slice(0, 70));
  results.liveImage = rec.status === 'done' && !!rec.imageUrl;
  console.log(results.liveImage ? '✅ 真实图片生成成功' : '❌ 图片未成功生成');
} else {
  console.log('❌ image.generate 失败:', imgRes.error);
}

// ===== Part C：失败降级（错 key）=====
console.log('\n=== Part C: 失败降级（注入错误 key）===');
await injectConfig(buildConfig({ llmKey: 'sk-invalid-key-for-degrade-test', imageKey: 'sk-invalid-key-for-degrade-test' }));

const deIdea = await send('idea.submit', {
  text: '随便一个想法用来测降级路径',
  selectedContextIds: [],
  selectedArchiveNoteIds: [],
});
console.log('  idea.submit success:', deIdea.success, '| name:', String(deIdea.payload?.artifact?.concept?.name ?? ''));
results.degradeLlm = deIdea.success && !!deIdea.payload?.artifact?.concept?.name;
console.log(results.degradeLlm ? '✅ LLM 失败降级正常（catch → 模板，不崩）' : '⚠️ LLM 失败未降级，需检查 gadget catch');

const deImg = await send('image.generate', {
  sourceType: 'idea', title: '降级测试', content: 'x', style: 'line-art',
});
const deRec = deImg.payload?.record;
console.log('  image.generate status:', deRec?.status, '| previewText:', String(deRec?.previewText ?? '').slice(0, 60));
results.degradeImage = deRec?.status === 'failed';
console.log(results.degradeImage ? '✅ 图片失败降级正常（status=failed，不崩）' : '⚠️ 图片失败处理异常');

await browser.close();

// ---------- 汇总 ----------
console.log('\n========== 阶段1 smoke 汇总 ==========');
console.log(`Part A 真实 LLM    : ${results.liveLlm ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Part B 真实生图    : ${results.liveImage ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Part C LLM 降级    : ${results.degradeLlm ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Part C 图片降级    : ${results.degradeImage ? '✅ PASS' : '❌ FAIL'}`);
const allPass = Object.values(results).every(Boolean);
console.log(allPass ? '\n🎉 阶段1 验收通过：真模型链路可用。' : '\n⚠️ 存在未通过项，见上方明细。');
process.exit(allPass ? 0 : 1);
