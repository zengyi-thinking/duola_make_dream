#!/usr/bin/env node

/**
 * 头像压缩脚本
 *
 * 把 public/avatars/ 下的原始大图 PNG 压缩为适合扩展使用的尺寸。
 * - 主图/chibi/封面 → 512px
 * - icon → 256px（更小，用于 FAB 和工具栏）
 *
 * 用法：node scripts/compress-avatars.mjs
 * 原图保留为 *.original.png，压缩后覆盖原文件名。
 */

import sharp from 'sharp';
import { readdirSync, statSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = join(__dirname, '..', 'public', 'avatars');

// 每个文件的压缩目标尺寸
const SIZE_MAP = {
  'pocketbuddy-yunyu-main.png': 512,
  'pocketbuddy-yunyun-chibi.png': 512,
  'pocketbuddy-lanling-icon.png': 256,
  'pocketagent-xingche-3d.png': 512,
};

async function compressAll() {
  console.log('🖼️  开始压缩头像...\n');
  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const [filename, size] of Object.entries(SIZE_MAP)) {
    const filePath = join(AVATAR_DIR, filename);
    if (!existsSync(filePath)) {
      console.log(`⚠️  跳过（不存在）: ${filename}`);
      continue;
    }

    const originalSize = statSync(filePath).size;
    const backupPath = join(AVATAR_DIR, filename.replace(/\.png$/, '.original.png'));

    // 首次压缩时备份原图（已备份则跳过）
    if (!existsSync(backupPath)) {
      renameSync(filePath, backupPath);
    }

    const sourcePath = existsSync(backupPath) ? backupPath : filePath;

    await sharp(sourcePath)
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .png({ quality: 80, compressionLevel: 9, palette: true })
      .toFile(filePath);

    const compressedSize = statSync(filePath).size;
    totalOriginal += originalSize;
    totalCompressed += compressedSize;

    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(0);
    console.log(`✅ ${filename}`);
    console.log(`   ${formatSize(originalSize)} → ${formatSize(compressedSize)} (${size}px, -${ratio}%)`);
  }

  console.log('\n' + '─'.repeat(40));
  console.log(`总计: ${formatSize(totalOriginal)} → ${formatSize(totalCompressed)}`);
  console.log(`原图备份为 *.original.png`);
  console.log('\n✅ 压缩完成。');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

compressAll().catch((err) => {
  console.error('❌ 压缩失败:', err);
  process.exit(1);
});
