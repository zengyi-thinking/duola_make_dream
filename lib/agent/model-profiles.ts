import type { ModelProfile, RuntimeConfig } from './types';

export type ModelProfileKind = 'llm' | 'image';

export function getModelProfiles(config: RuntimeConfig | null | undefined, kind: ModelProfileKind): ModelProfile[] {
  if (!config) return [];
  return kind === 'llm' ? config.llmProfiles : config.imageProfiles;
}

export function getActiveModelProfile(config: RuntimeConfig | null | undefined, kind: ModelProfileKind): ModelProfile | null {
  const profiles = getModelProfiles(config, kind);
  if (profiles.length === 0) return null;
  const activeId = kind === 'llm' ? config?.activeLlmProfileId : config?.activeImageProfileId;
  return profiles.find((profile) => profile.id === activeId) ?? profiles[0];
}

export function formatModelProfileSummary(profile: ModelProfile | null | undefined): string {
  if (!profile) return '未配置';
  return [
    profile.name || '未命名',
    profile.model || '未命名模型',
    formatEndpointHost(profile.endpoint),
  ].filter(Boolean).join(' · ');
}

export function formatEndpointHost(endpoint: string): string {
  if (!endpoint) return '未配置端点';
  try {
    const url = new URL(endpoint);
    return url.host;
  } catch {
    return endpoint.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return '未配置';
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}…${apiKey.slice(-2)}`;
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}

export function describeProfileHealth(profile: ModelProfile | null | undefined): string {
  if (!profile) return '未激活';
  if (!profile.apiKey || !profile.endpoint || !profile.model) return '未补全';
  return '已可调用';
}
