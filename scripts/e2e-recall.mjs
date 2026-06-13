#!/usr/bin/env node
/**
 * 阶段2 召回回归测试（对应 docs/pocketbuddy-execution-plan.md 阶段2验收）。
 *
 * 纯本地、无需 API key。注入一组有「关系边」的记忆数据，发 memory.recall，断言：
 *   A：中文 bigram 匹配——query「知识卡片工具」命中 artifact「网页知识卡」（共享 bigram 知识/卡片）。
 *   B：关系图扩展——被 artifact 引用、但与 query 字面完全不重叠的 note，靠 graph 边被带出（via:'graph'）。
 *   C：每条召回都带结构化 recallDetail（via/evidence）。
 *   D：hybrid 优于纯字面——召回集里存在 via:'graph' 的条目（纯字面永远召不回）。
 *   E：精准性——与 query 无关且无关系边的干扰 note 不被召回。
 *
 * 用法：npm run build && node scripts/e2e-recall.mjs
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const EXT = join(ROOT, '.output/chrome-mv3').replace(/\\/g, '/');
const PROFILE = join(ROOT, '.test-profile-recall');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

if (!existsSync(EXT)) {
  console.error(`❌ 找不到构建产物 ${EXT}，请先 npm run build`);
  process.exit(1);
}

// 注入的记忆数据：artifactA 引用 noteX（关系边），noteZ 是无关干扰项
const SEED = {
  profile: {
    visualLikes: ['蓝白线条', '口袋感'], visualDislikes: [],
    tonePreference: '温暖、直接、产品化',
    productPreferences: ['轻量工具', '浏览器插件'],
    recentThemes: [], lastUpdated: 1700000000000,
  },
  artifactHistory: [{
    id: 'art-1', ideaId: 'idea-1', intent: 'browser-extension',
    concept: {
      name: '网页知识卡', tagline: '把每个网页变成可复习的知识卡片',
      positioning: '面向研究者的浏览器插件', coreProblem: '网页信息易遗忘',
      targetUser: '学生与研究者', valueProposition: '一键结构化',
      features: ['一键生成知识卡', '自动提炼要点'], visualDirection: ['蓝白线条'],
    },
    imagePrompt: 'knowledge card illustration',
    mvpPlan: ['读取网页', '生成卡片'], nextTasks: ['导出'],
    appliedGadgets: ['IdeaLens'],
    selectedContextIds: [],
    selectedArchiveNoteIds: ['noteX'], // ← 关系边：artifact → noteX
    createdAt: 1700000000000,
  }],
  archiveNotes: [
    {
      // noteX：被 artifactA 引用，但字面与 query「知识卡片工具」完全不重叠 → 只能靠 graph 带出
      id: 'noteX', title: '学习心得', sourceTitle: '复盘笔记', origin: 'https://example.com',
      summary: '每日复盘的方法论与节奏', tags: ['复盘'], createdAt: 1700000000000,
    },
    {
      // noteZ：无关干扰项，无关系边，字面也不重叠 → 不应被召回
      id: 'noteZ', title: '健身计划', sourceTitle: '运动日志', origin: 'https://gym.example',
      summary: '每周三次力量训练与拉伸', tags: ['运动'], createdAt: 1700000000000,
    },
  ],
  ideaHistory: [], feedbackLog: [], contextSnippets: [], pageContexts: [],
  memoryCandidates: [], approvedMemories: [], generatedImages: [],
  generatedMindmaps: [], harnessPatches: [], profileHistory: [],
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
if (!sw) { console.error('❌ SW 未启动'); await browser.close(); process.exit(1); }
const extId = new URL(sw.url()).host;
const swClient = await sw.createCDPSession();
await swClient.send('Runtime.enable');

// 注入 seed 数据
await swClient.send('Runtime.evaluate', {
  expression: `(async () => { await chrome.storage.local.set(${JSON.stringify(SEED)}); return 'ok'; })()`,
  returnByValue: true, awaitPromise: true,
});
console.log('✅ 已注入记忆数据（artifactA → noteX 关系边 + noteZ 干扰）');

// sidepanel 发消息
const sidePanel = await browser.newPage();
await sidePanel.goto(`chrome-extension://${extId}/sidepanel.html`);
await wait(1500);

const res = await sidePanel.evaluate(() => new Promise((resolve) => {
  chrome.runtime.sendMessage(
    { type: 'memory.recall', requestId: 'recall-1', source: 'popup', payload: { query: '知识卡片工具', limit: 10 } },
    (resp) => resolve(resp ? { success: resp.success, error: resp.error, items: resp.payload?.items } : { success: false, error: chrome.runtime.lastError?.message }),
  );
}));

console.log('\n=== memory.recall 返回 ===');
console.log('success:', res.success);
if (!res.success) { console.error('❌', res.error); await browser.close(); process.exit(1); }

const items = res.items ?? [];
console.log(`召回 ${items.length} 条：`);
items.forEach((it) => {
  const d = it.recallDetail ?? {};
  console.log(`  [${it.kind}] ${it.title} | score=${it.score.toFixed(3)} | via=${d.via ?? '-'} evidence=${d.evidence ?? '-'} linkedFrom=${d.linkedFrom?.title ?? '-'}`);
});

// ---------- 断言 ----------
const R = { A: false, B: false, C: false, D: false, E: false };
const artifact = items.find((i) => i.id === 'art-1');
const noteX = items.find((i) => i.id === 'noteX');
const noteZ = items.find((i) => i.id === 'noteZ');

// A：artifact 靠中文 bigram 命中被召回（字面或主题层）
R.A = !!artifact && (artifact.recallDetail?.via === 'literal' || artifact.recallDetail?.via === 'theme');
console.log(`\nA 中文 bigram 命中 artifact: ${R.A ? '✅' : '❌'} (via=${artifact?.recallDetail?.via})`);

// B：noteX 靠关系图被带出，linkedFrom 指向 artifact
R.B = !!noteX && noteX.recallDetail?.via === 'graph' && noteX.recallDetail?.linkedFrom?.kind === 'artifact';
console.log(`B 关系图带出 noteX: ${R.B ? '✅' : '❌'} (via=${noteX?.recallDetail?.via}, from=${noteX?.recallDetail?.linkedFrom?.kind})`);

// C：每条都带结构化 recallDetail
R.C = items.length > 0 && items.every((i) => i.recallDetail && typeof i.recallDetail.via === 'string' && typeof i.recallDetail.evidence === 'string');
console.log(`C 全部带结构化原因: ${R.C ? '✅' : '❌'}`);

// D：召回集存在 via:graph 条目（纯字面永远召不回 → hybrid 优于纯字面）
R.D = items.some((i) => i.recallDetail?.via === 'graph');
console.log(`D hybrid 多召回(graph): ${R.D ? '✅' : '❌'}`);

// E：无关干扰 noteZ 不被召回
R.E = !noteZ;
console.log(`E 干扰项 noteZ 未召回: ${R.E ? '✅' : '❌'}`);

await browser.close();

const allPass = Object.values(R).every(Boolean);
console.log(`\n========== 阶段2 召回归纳 =========`);
console.log(`A bigram: ${R.A ? '✅' : '❌'} | B graph: ${R.B ? '✅' : '❌'} | C 结构化: ${R.C ? '✅' : '❌'} | D hybrid: ${R.D ? '✅' : '❌'} | E 精准: ${R.E ? '✅' : '❌'}`);
console.log(allPass ? '\n🎉 阶段2 召回验收通过。' : '\n⚠️ 存在未通过项。');
process.exit(allPass ? 0 : 1);
