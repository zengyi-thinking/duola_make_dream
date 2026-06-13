import { browser } from 'wxt/browser';
import type { StateBackup, StorageSchema, StorageSnapshot } from './schema';
import { DEFAULT_RUNTIME_CONFIG, STORAGE_KEYS, createDefaultStorageState } from './schema';

type StorageKey = keyof StorageSchema;

const DEFAULT_STATE = createDefaultStorageState();
let runtimeConfigWriteQueue: Promise<void> = Promise.resolve();

function normalizeRuntimeConfig(
  runtimeConfig: Partial<StorageSchema['runtimeConfig']> | undefined,
): StorageSchema['runtimeConfig'] {
  return {
    ...DEFAULT_RUNTIME_CONFIG,
    ...runtimeConfig,
    avatarId: runtimeConfig?.avatarId ?? DEFAULT_RUNTIME_CONFIG.avatarId,
  };
}

export async function readStorage<K extends StorageKey>(key: K): Promise<StorageSchema[K]> {
  try {
    const result = await browser.storage.local.get(key);
    return (result[key] as StorageSchema[K] | undefined) ?? DEFAULT_STATE[key];
  } catch (error) {
    throw new Error(`读取 storage(${String(key)}) 失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function writeStorage<K extends StorageKey>(
  key: K,
  value: StorageSchema[K],
): Promise<void> {
  try {
    await browser.storage.local.set({ [key]: value });
  } catch (error) {
    throw new Error(`写入 storage(${String(key)}) 失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function readStorageSnapshot(): Promise<StorageSchema> {
  let result: Record<string, unknown>;
  try {
    result = await browser.storage.local.get(Object.values(STORAGE_KEYS));
  } catch (error) {
    throw new Error(`读取 storage 快照失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    profile: (result.profile as StorageSchema['profile'] | undefined) ?? DEFAULT_STATE.profile,
    profileHistory: (result.profileHistory as StorageSchema['profileHistory'] | undefined) ?? [],
    ideaHistory: (result.ideaHistory as StorageSchema['ideaHistory'] | undefined) ?? [],
    artifactHistory: (result.artifactHistory as StorageSchema['artifactHistory'] | undefined) ?? [],
    feedbackLog: (result.feedbackLog as StorageSchema['feedbackLog'] | undefined) ?? [],
    contextSnippets: (result.contextSnippets as StorageSchema['contextSnippets'] | undefined) ?? [],
    pageContexts: (result.pageContexts as StorageSchema['pageContexts'] | undefined) ?? [],
    archiveNotes: (result.archiveNotes as StorageSchema['archiveNotes'] | undefined) ?? [],
    memoryCandidates: (result.memoryCandidates as StorageSchema['memoryCandidates'] | undefined) ?? [],
    approvedMemories: (result.approvedMemories as StorageSchema['approvedMemories'] | undefined) ?? [],
    generatedImages: (result.generatedImages as StorageSchema['generatedImages'] | undefined) ?? [],
    generatedMindmaps: (result.generatedMindmaps as StorageSchema['generatedMindmaps'] | undefined) ?? [],
    harnessPatches: (result.harnessPatches as StorageSchema['harnessPatches'] | undefined) ?? [],
    stateBackups: (result.stateBackups as StorageSchema['stateBackups'] | undefined) ?? [],
    runtimeConfig: normalizeRuntimeConfig(
      result.runtimeConfig as Partial<StorageSchema['runtimeConfig']> | undefined,
    ),
  };
}

export async function resetStorageScope(scope: keyof StorageSchema | 'all'): Promise<StorageSchema> {
  if (scope === 'all') {
    const next = createDefaultStorageState();
    await browser.storage.local.set(next);
    return next;
  }

  const snapshot = await readStorageSnapshot();
  const next = createDefaultStorageState()[scope];
  const merged = {
    ...snapshot,
    [scope]: next,
  } satisfies StorageSchema;

  try {
    await browser.storage.local.set({ [scope]: next });
  } catch (error) {
    throw new Error(`重置 storage(${String(scope)}) 失败: ${error instanceof Error ? error.message : String(error)}`);
  }
  return merged;
}

export async function appendLimited<K extends StorageKey>(
  key: K,
  item: StorageSchema[K] extends Array<infer T> ? T : never,
  limit: number,
): Promise<StorageSchema[K]> {
  const current = await readStorage(key);

  if (!Array.isArray(current)) {
    throw new Error(`${key} 不是数组类型，无法追加`);
  }

  const next = [item, ...current].slice(0, limit) as StorageSchema[K];
  await writeStorage(key, next);
  return next;
}

export async function removeById<K extends StorageKey>(
  key: K,
  id: string,
): Promise<StorageSchema[K]> {
  const current = await readStorage(key);

  if (!Array.isArray(current)) {
    throw new Error(`${key} 不是数组类型，无法删除记录`);
  }

  const next = current.filter((item) => {
    if (!item || typeof item !== 'object' || !('id' in item)) return true;
    return item.id !== id;
  }) as StorageSchema[K];

  await writeStorage(key, next);
  return next;
}

export async function replaceArrayItem<K extends StorageKey>(
  key: K,
  id: string,
  updater: (item: StorageSchema[K] extends Array<infer T> ? T : never) => StorageSchema[K] extends Array<infer T> ? T : never,
): Promise<StorageSchema[K]> {
  const current = await readStorage(key);

  if (!Array.isArray(current)) {
    throw new Error(`${key} 不是数组类型，无法更新记录`);
  }

  const next = current.map((item) => {
    if (!item || typeof item !== 'object' || !('id' in item)) return item;
    return item.id === id ? updater(item as never) : item;
  }) as StorageSchema[K];

  await writeStorage(key, next);
  return next;
}

export async function clearArrayStorage<K extends StorageKey>(key: K): Promise<StorageSchema[K]> {
  const current = await readStorage(key);

  if (!Array.isArray(current)) {
    throw new Error(`${key} 不是数组类型，无法清空`);
  }

  const next = [] as unknown as StorageSchema[K];
  await writeStorage(key, next);
  return next;
}

/**
 * 读取运行时配置。
 * privacy-check: allow — apiKey 存于扩展本地 storage，不上传第三方
 */
export async function getRuntimeConfig(): Promise<StorageSchema['runtimeConfig']> {
  return normalizeRuntimeConfig(await readStorage('runtimeConfig'));
}

/**
 * 部分更新运行时配置（浅合并）。
 * privacy-check: allow — apiKey 存于扩展本地 storage，不上传第三方
 */
export async function updateRuntimeConfig(
  patch: Partial<StorageSchema['runtimeConfig']>,
): Promise<StorageSchema['runtimeConfig']> {
  const nextWrite = runtimeConfigWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const current = await getRuntimeConfig();
      const next = { ...current, ...patch };
      await writeStorage('runtimeConfig', next);
      return next;
    });

  runtimeConfigWriteQueue = nextWrite.then(() => undefined, () => undefined);
  return nextWrite;
}

export async function flushRuntimeConfigWrites(): Promise<void> {
  await runtimeConfigWriteQueue.catch(() => undefined);
}

export async function saveStateBackup(
  label = '手动快照',
): Promise<StateBackup> {
  const snapshot = await readStorageSnapshot();
  const { stateBackups: _ignored, ...snapshotWithoutBackups } = snapshot;
  const backup: StateBackup = {
    id: crypto.randomUUID(),
    label,
    createdAt: Date.now(),
    snapshot: snapshotWithoutBackups,
  };

  const next = [backup, ...snapshot.stateBackups].slice(0, 8);
  await writeStorage('stateBackups', next);
  return backup;
}

export async function restoreStateBackup(backupId: string): Promise<StorageSchema> {
  const snapshot = await readStorageSnapshot();
  const target = snapshot.stateBackups.find((backup) => backup.id === backupId);
  if (!target) {
    throw new Error(`找不到备份 ${backupId}`);
  }

  const next: StorageSchema = {
    ...target.snapshot,
    stateBackups: snapshot.stateBackups,
  };

  try {
    await browser.storage.local.set(next);
  } catch (error) {
    throw new Error(`恢复备份失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  return next;
}

export async function getStateBackups(): Promise<StateBackup[]> {
  return readStorage('stateBackups');
}

export async function getStorageSnapshot(): Promise<StorageSnapshot> {
  const { stateBackups: _ignored, ...snapshot } = await readStorageSnapshot();
  return snapshot;
}
