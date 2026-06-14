#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const META_DIR = resolve(ROOT, '.build');
const VERSION_FILE = resolve(META_DIR, 'extension-version.json');
const [bin, ...args] = process.argv.slice(2);

if (!bin) {
  console.error('Usage: node scripts/run-build-step.mjs <bin> [...args]');
  process.exit(1);
}

const version = nextExtensionVersion();
const result = spawnSync(process.execPath, [resolve(ROOT, bin), ...args], {
  stdio: 'inherit',
  env: {
    ...process.env,
    POCKETBUDDY_EXTENSION_VERSION: version,
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function nextExtensionVersion() {
  mkdirSync(META_DIR, { recursive: true });

  let counter = 0;
  if (existsSync(VERSION_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(VERSION_FILE, 'utf8'));
      if (typeof parsed?.counter === 'number' && Number.isFinite(parsed.counter)) {
        counter = parsed.counter;
      }
    } catch {
      counter = 0;
    }
  }

  counter += 1;
  writeFileSync(VERSION_FILE, JSON.stringify({ counter, updatedAt: Date.now() }, null, 2));

  const major = 0;
  const minor = 1;
  const buildHigh = Math.floor(counter / 65535);
  const buildLow = counter % 65535;
  return `${major}.${minor}.${buildHigh}.${buildLow}`;
}
