#!/usr/bin/env node
/**
 * 开发期环境变量注入（安全约束：API Key 零硬编码）。
 *
 * 把 .env / 环境变量的 LLM/IMAGE 凭据写入 gitignore 的本地副本
 * config/local-runtime-config.json，运行时由 createBundledRuntimeConfig 合并
 * （apiKey 非空时覆盖 bundled 占位）。合并顺序：bundled 默认 → 本地副本(env) → 用户 storage。
 *
 * 安全边界：
 * - 永不写回已提交的 config/bundled-runtime-config.json
 * - 本地副本 gitignore，不入库
 * - --clean 生成空占位（build 前用，确保产物无真实 key）
 *
 * 用法：
 *   node scripts/inject-dev-config.mjs          # 读 .env + process.env，注入 key（dev 用）
 *   node scripts/inject-dev-config.mjs --clean  # 生成空占位（build 前用）
 *
 * 环境变量（均可选）：LLM_API_KEY / LLM_ENDPOINT / LLM_MODEL / IMAGE_API_KEY / IMAGE_ENDPOINT / IMAGE_MODEL
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const targetPath = resolve(root, 'config', 'local-runtime-config.json');
const envPath = resolve(root, '.env');

const isClean = process.argv.includes('--clean');

// 读 .env（不覆盖已存在的 process.env）
function loadDotEnv() {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

if (!isClean) loadDotEnv();

const pick = (k) => (isClean ? '' : process.env[k] || '');

const config = {
  llm: { apiKey: pick('LLM_API_KEY'), endpoint: pick('LLM_ENDPOINT'), model: pick('LLM_MODEL') },
  image: { apiKey: pick('IMAGE_API_KEY'), endpoint: pick('IMAGE_ENDPOINT'), model: pick('IMAGE_MODEL') },
};

writeFileSync(targetPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

if (isClean) {
  console.log('[inject-dev-config] --clean: 已生成空占位（确保 build 产物无真实 key）');
} else if (config.llm.apiKey || config.image.apiKey) {
  console.log('[inject-dev-config] 已从环境变量注入 API Key');
} else {
  console.log('[inject-dev-config] 未检测到 key，生成空占位（请在设置页填 key，或创建 .env）');
}
