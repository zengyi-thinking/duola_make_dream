#!/usr/bin/env node

/**
 * PocketBuddy 隐私静态检查脚本
 *
 * 扫描源码中的高风险关键词，确保：
 * - 不意外泄露用户隐私数据
 * - 不包含硬编码的 API 密钥
 * - 不使用 Dora/哆啦A梦 等受版权保护的品牌名称
 * - 对必要命中的代码要求 allowlist 注释
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolveRoot();
const SCAN_DIRS = ['entrypoints', 'components', 'lib', 'public', 'types'];
const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.html', '.css', '.svg']);

const HIGH_RISK_PATTERNS = [
  { id: 'openai-key', pattern: /OPENAI_API_KEY|apiKey\s*[:=]\s*["'][\w-]{10,}/i, level: 'critical', reason: '硬编码 API 密钥' },
  { id: 'local-storage', pattern: /localStorage|sessionStorage/, level: 'high', reason: '直接使用 localStorage/sessionStorage（应使用 browser.storage）' },
  { id: 'form-data', pattern: /FormData/, level: 'medium', reason: 'FormData 使用需确认不泄露敏感字段' },
  { id: 'inner-html', pattern: /innerHTML|outerHTML/, level: 'medium', reason: 'innerHTML 可能导致 XSS 或泄露敏感 DOM' },
  { id: 'input-value', pattern: /\binput\.value\b|\btextarea\.value\b/, level: 'low', reason: '直接读取表单值（content script 中需确认不在敏感字段上触发）' },
  { id: 'body-text', pattern: /document\.body\.innerText|document\.body\.textContent/, level: 'medium', reason: '读取整个页面正文（应使用 sanitizer 提取）' },
  { id: 'location-href', pattern: /location\.href|window\.location\b(?!\.origin\b)/, level: 'low', reason: '访问完整 URL（应只使用 origin）' },
  { id: 'doc-url', pattern: /document\.URL|document\.documentURI/, level: 'low', reason: '访问完整文档 URL' },
  { id: 'dora-brand', pattern: /Dora(?!Agent|dora-avatar|dora-happy|dora-thinking|dora-surprised)|哆啦A梦|小叮当/, level: 'medium', reason: '受版权保护的品牌名称（使用 allowlist 注释可豁免）' },
];

const ALLOWLIST_COMMENT = /privacy-check:\s*allow/i;

let exitCode = 0;
let totalHits = 0;
let criticalHits = 0;

console.log('🔒 PocketBuddy Privacy Check\n');
console.log(`扫描目录: ${SCAN_DIRS.join(', ')}\n`);

const files = collectFiles(ROOT, SCAN_DIRS);

for (const filePath of files) {
  const relPath = relative(ROOT, filePath).replace(/\\/g, '/');
  let content;

  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    continue;
  }

  const lines = content.split('\n');

  for (const { id, pattern, level, reason } of HIGH_RISK_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!pattern.test(line)) continue;

      // 检查上方是否有 allowlist 注释（检查当前行和前面两行）
      const context = [lines[i - 2], lines[i - 1], line].filter(Boolean).join('\n');
      if (ALLOWLIST_COMMENT.test(context)) continue;

      totalHits++;
      if (level === 'critical') criticalHits++;

      const prefix = level === 'critical' ? '🚨' : level === 'high' ? '🔴' : level === 'medium' ? '🟡' : '🟢';
      console.log(`${prefix} [${level.toUpperCase()}] ${id}`);
      console.log(`   文件: ${relPath}:${i + 1}`);
      console.log(`   原因: ${reason}`);
      console.log(`   内容: ${line.trim().slice(0, 120)}`);
      console.log();
    }
  }
}

console.log('─'.repeat(50));
console.log(`总命中: ${totalHits}  (critical: ${criticalHits})`);
console.log(`扫描文件: ${files.length}`);

if (criticalHits > 0) {
  console.log('\n❌ 发现高风险项，退出码 1。');
  exitCode = 1;
} else if (totalHits > 0) {
  console.log('\n⚠️  存在低/中风险命中，请确认是否需要添加 allowlist 注释。');
} else {
  console.log('\n✅ 全部通过，无隐私风险命中。');
}

process.exit(exitCode);

// ===== 工具函数 =====

function resolveRoot() {
  const __filename = fileURLToPath(import.meta.url);
  return join(dirname(__filename), '..');
}

function collectFiles(root, dirs) {
  const result = [];

  for (const dir of dirs) {
    const dirPath = join(root, dir);
    if (!isDir(dirPath)) continue;
    walk(dirPath, result);
  }

  return result;
}

function walk(dirPath, result) {
  for (const entry of readdirSync(dirPath)) {
    const full = join(dirPath, entry);
    if (isDir(full)) {
      walk(full, result);
    } else if (SCAN_EXTS.has(extname(full))) {
      result.push(full);
    }
  }
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
