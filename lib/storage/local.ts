import { browser } from 'wxt/browser';
import type { StateBackup, StorageSchema, StorageSnapshot } from './schema';
import type { ModelProfile } from '@/lib/agent/types';
import type { PocketAvatarId } from '@/lib/brand/avatars';
import { STORAGE_KEYS, createBundledRuntimeConfig, createDefaultStorageState } from './schema';
import type {
  GeneratedImageRecord,
  ImageGenerationRequest,
  ImageGenerationSourceType,
  ImageGenerationStyle,
} from '@/lib/image/types';

type StorageKey = keyof StorageSchema;

const DEFAULT_STATE = createDefaultStorageState();
let runtimeConfigWriteQueue: Promise<void> = Promise.resolve();

function normalizeStorageSnapshot(
  snapshot: StorageSnapshot & Partial<Pick<StorageSchema, 'stateBackups'>>,
): StorageSchema {
  return {
    ...snapshot,
    generatedImages: normalizeGeneratedImages(snapshot.generatedImages),
    runtimeConfig: normalizeRuntimeConfig(snapshot.runtimeConfig),
    pipelineRuns: snapshot.pipelineRuns ?? [],
    stateBackups: snapshot.stateBackups ?? [],
    graphViews: snapshot.graphViews ?? [],
    skillRegistry: snapshot.skillRegistry ?? [],
    experienceRecords: snapshot.experienceRecords ?? [],
  };
}

function normalizeGeneratedImages(
  records: StorageSchema['generatedImages'] | undefined,
): StorageSchema['generatedImages'] {
  return (records ?? []).map((record) => normalizeGeneratedImageRecord(record as GeneratedImageRecord));
}

function normalizeGeneratedImageRecord(record: GeneratedImageRecord): GeneratedImageRecord {
  const parsedRequest = normalizeImageRequest(record);

  return {
    ...record,
    requestId: record.requestId || parsedRequest.id,
    request: parsedRequest,
    prompt: record.prompt || buildImagePromptFromRequest(parsedRequest),
    status: record.status ?? 'failed',
    createdAt: record.createdAt || parsedRequest.createdAt,
  };
}

function normalizeImageRequest(record: Partial<GeneratedImageRecord>): ImageGenerationRequest {
  const fallback = inferImageRequestFromPrompt(
    record.prompt ?? '',
    record.requestId ?? record.id ?? crypto.randomUUID(),
    record.createdAt ?? Date.now(),
  );

  const request = record.request ?? ({} as Partial<ImageGenerationRequest>);
  return {
    id: request.id ?? fallback.id,
    createdAt: request.createdAt ?? fallback.createdAt,
    sourceType: request.sourceType ?? fallback.sourceType,
    title: request.title ?? fallback.title,
    content: request.content ?? fallback.content,
    style: request.style ?? fallback.style,
    relatedNoteId: request.relatedNoteId ?? fallback.relatedNoteId,
  };
}

function inferImageRequestFromPrompt(
  prompt: string,
  fallbackId: string,
  fallbackCreatedAt: number,
): ImageGenerationRequest {
  const sourceText = extractPromptSection(prompt, 'Source', 'Title:');
  const title = extractPromptSection(prompt, 'Title', 'Style:') || '旧图片记录';
  const styleText = extractPromptSection(prompt, 'Style', 'Content:');
  const content = extractPromptSection(prompt, 'Content', 'Do not use copyrighted cartoon characters') || prompt;

  return {
    id: fallbackId,
    createdAt: fallbackCreatedAt,
    sourceType: inferSourceTypeFromPrompt(sourceText),
    title,
    content,
    style: inferImageStyleFromPrompt(styleText || prompt),
  };
}

function inferSourceTypeFromPrompt(sourceText: string): ImageGenerationSourceType {
  if (sourceText === 'page-summary' || sourceText === 'paper-note' || sourceText === 'article-note' || sourceText === 'mindmap') {
    return sourceText;
  }
  return 'idea';
}

function inferImageStyleFromPrompt(styleText: string): ImageGenerationStyle {
  const lowered = styleText.toLowerCase();

  if (lowered.includes('mindmap')) return 'mindmap';
  if (lowered.includes('knowledge card')) return 'knowledge-card';
  if (lowered.includes('browser extension popup') || lowered.includes('product ui concept') || lowered.includes('product design framing')) {
    return 'product-ui';
  }
  if (lowered.includes('clean poster layout') || lowered.includes('concept poster design')) return 'poster';
  return 'line-art';
}

function extractPromptSection(prompt: string, label: string, endMarker: string): string {
  const startMarker = `${label}:`;
  const startIndex = prompt.indexOf(startMarker);
  if (startIndex < 0) return '';

  const contentStart = startIndex + startMarker.length;
  const endIndex = prompt.indexOf(endMarker, contentStart);
  const raw = prompt.slice(contentStart, endIndex >= 0 ? endIndex : prompt.length);
  return raw.trim().replace(/\.$/, '').trim();
}

function buildImagePromptFromRequest(request: ImageGenerationRequest): string {
  const styleMap = {
    'line-art': 'minimalist line-art illustration, blue and white palette, pocket assistant aesthetic',
    'product-ui': 'clean product UI concept, browser extension popup, product design framing',
    'knowledge-card': 'knowledge card poster, structured typography, educational card composition',
    poster: 'clean poster layout, visual hierarchy, concept poster design',
    mindmap: 'structured mindmap poster, concept graph, blue-white knowledge map',
  } satisfies Record<ImageGenerationRequest['style'], string>;

  return [
    `Source: ${request.sourceType}.`,
    `Title: ${request.title}.`,
    `Style: ${styleMap[request.style]}.`,
    `Content: ${request.content}.`,
    'Do not use copyrighted cartoon characters. Keep the visual language original, soft, pocket-like, and product-ready.',
  ].join(' ');
}

function normalizeRuntimeConfig(
  runtimeConfig: Partial<StorageSchema['runtimeConfig']> | undefined,
): StorageSchema['runtimeConfig'] {
  const bundled = createBundledRuntimeConfig();
  const raw = runtimeConfig as Record<string, unknown> | undefined;

  const llmLegacy = buildLegacyProfile({
    id: 'legacy-llm',
    name: '默认模型',
    apiKey: readString(raw?.llmApiKey),
    endpoint: readString(raw?.llmEndpoint),
    model: readString(raw?.llmModel),
  });
  const imageLegacy = buildLegacyProfile({
    id: 'legacy-image',
    name: '默认生图',
    apiKey: readString(raw?.imageApiKey),
    endpoint: readString(raw?.imageProxyEndpoint),
    model: readString(raw?.imageModel),
  });

  const llmProfiles = normalizeProfileList(raw?.llmProfiles, bundled.llmProfiles, llmLegacy);
  const imageProfiles = normalizeProfileList(raw?.imageProfiles, bundled.imageProfiles, imageLegacy);

  return {
    agentName: readString(raw?.agentName, bundled.agentName),
    defaultTone: readString(raw?.defaultTone, bundled.defaultTone),
    avatarId: readString(raw?.avatarId, bundled.avatarId) as StorageSchema['runtimeConfig']['avatarId'],
    maxSelectionChars: readNumber(raw?.maxSelectionChars, bundled.maxSelectionChars),
    maxMainTextChars: readNumber(raw?.maxMainTextChars, bundled.maxMainTextChars),
    maxPageExcerptChars: readNumber(raw?.maxPageExcerptChars, bundled.maxPageExcerptChars),
    futurePermissionMode: readFuturePermissionMode(raw?.futurePermissionMode, bundled.futurePermissionMode),
    llmProfiles,
    activeLlmProfileId: resolveActiveProfileId(raw?.activeLlmProfileId, llmProfiles, bundled.activeLlmProfileId),
    imageProfiles,
    activeImageProfileId: resolveActiveProfileId(raw?.activeImageProfileId, imageProfiles, bundled.activeImageProfileId),
    voiceOverrides: normalizeVoiceOverrides(raw?.voiceOverrides),
  };
}

function normalizeVoiceOverrides(value: unknown): Partial<Record<PocketAvatarId, string>> {
  if (!value || typeof value !== 'object') return {};
  const result: Partial<Record<PocketAvatarId, string>> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') result[k as PocketAvatarId] = v;
  }
  return result;
}

function buildLegacyProfile(profile: ModelProfile): ModelProfile | null {
  if (!profile.apiKey && !profile.endpoint && !profile.model) {
    return null;
  }

  return {
    id: profile.id || crypto.randomUUID(),
    name: profile.name || '配置档',
    apiKey: profile.apiKey.trim(),
    endpoint: profile.endpoint.trim(),
    model: profile.model.trim(),
  };
}

function normalizeProfileList(
  profiles: unknown,
  fallbackProfiles: ModelProfile[],
  legacyProfile: ModelProfile | null,
): ModelProfile[] {
  const normalized = Array.isArray(profiles)
    ? profiles.map((profile, index) => normalizeProfile(profile, index)).filter((item): item is ModelProfile => Boolean(item))
    : [];

  if (normalized.length > 0) return normalized;
  if (legacyProfile) return [legacyProfile];
  return fallbackProfiles.map((profile) => ({ ...profile }));
}

function normalizeProfile(profile: unknown, index: number): ModelProfile | null {
  if (!profile || typeof profile !== 'object') return null;
  const raw = profile as Partial<ModelProfile>;
  const hasValue = Boolean(raw.id || raw.name || raw.apiKey || raw.endpoint || raw.model);
  if (!hasValue) return null;

  return {
    id: readString(raw.id, `profile-${index + 1}`),
    name: readString(raw.name, `配置档 ${index + 1}`),
    apiKey: readString(raw.apiKey),
    endpoint: readString(raw.endpoint),
    model: readString(raw.model),
  };
}

function resolveActiveProfileId(
  activeId: unknown,
  profiles: ModelProfile[],
  fallbackId: string | null,
): string | null {
  const candidate = readString(activeId);
  if (candidate && profiles.some((profile) => profile.id === candidate)) {
    return candidate;
  }
  if (fallbackId && profiles.some((profile) => profile.id === fallbackId)) {
    return fallbackId;
  }
  return profiles[0]?.id ?? null;
}

function readString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const next = value.trim();
  return next || fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readFuturePermissionMode(
  value: unknown,
  fallback: StorageSchema['runtimeConfig']['futurePermissionMode'],
): StorageSchema['runtimeConfig']['futurePermissionMode'] {
  return value === 'all_urls-dev' || value === 'activeTab-ready' ? value : fallback;
}

export async function readStorage<K extends StorageKey>(key: K): Promise<StorageSchema[K]> {
  try {
    const result = await browser.storage.local.get(key);
    const rawValue = result[key] as StorageSchema[K] | undefined;
    if (key === 'runtimeConfig') {
      return normalizeRuntimeConfig(rawValue as Partial<StorageSchema['runtimeConfig']> | undefined) as StorageSchema[K];
    }
    if (key === 'generatedImages') {
      return normalizeGeneratedImages(rawValue as StorageSchema['generatedImages'] | undefined) as StorageSchema[K];
    }
    return rawValue ?? DEFAULT_STATE[key];
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

  return normalizeStorageSnapshot({
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
    pipelineRuns: (result.pipelineRuns as StorageSchema['pipelineRuns'] | undefined) ?? [],
    stateBackups: (result.stateBackups as StorageSchema['stateBackups'] | undefined) ?? [],
    graphViews: (result.graphViews as StorageSchema['graphViews'] | undefined) ?? [],
    skillRegistry: (result.skillRegistry as StorageSchema['skillRegistry'] | undefined) ?? [],
    experienceRecords: (result.experienceRecords as StorageSchema['experienceRecords'] | undefined) ?? [],
    runtimeConfig: normalizeRuntimeConfig(
      result.runtimeConfig as Partial<StorageSchema['runtimeConfig']> | undefined,
    ),
  });
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
  return readStorage('runtimeConfig');
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

  const restoredSnapshot = normalizeStorageSnapshot(target.snapshot);
  const next: StorageSchema = {
    ...restoredSnapshot,
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
