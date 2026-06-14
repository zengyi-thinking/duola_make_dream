import type {
  ApprovedMemory,
  FeedbackAction,
  MemoryCandidate,
  UserProfile,
} from '@/lib/agent/types';
import { matchTopics } from '@/lib/agent/topics';
import { DEFAULT_PROFILE } from '@/lib/storage/schema';

export function createProfile(): UserProfile {
  return {
    ...DEFAULT_PROFILE,
    lastUpdated: Date.now(),
  };
}

export function mergeRecentThemes(profile: UserProfile, themes: string[]): UserProfile {
  return {
    ...profile,
    recentThemes: [...new Set([...themes, ...profile.recentThemes])].slice(0, 8),
    lastUpdated: Date.now(),
  };
}

export function applyFeedbackToProfile(
  profile: UserProfile,
  action: FeedbackAction,
): UserProfile {
  const next = { ...profile };

  if (action === 'more-minimal') next.visualLikes = mergeStringList(next.visualLikes, ['极简']);
  if (action === 'cuter') next.visualLikes = mergeStringList(next.visualLikes, ['可爱']);
  if (action === 'more-tech') next.visualLikes = mergeStringList(next.visualLikes, ['科技感']);
  if (action === 'more-productized') {
    next.productPreferences = mergeStringList(next.productPreferences, ['更强产品感']);
  }
  if (action === 'dislike-direction') {
    next.visualDislikes = mergeStringList(next.visualDislikes, ['当前方向过于松散']);
  }

  next.lastUpdated = Date.now();
  return next;
}

export function extractThemesFromIdea(text: string): string[] {
  // 委托给共享主题词库（lib/agent/topics.ts）—— router 和这里共用同一份正则。
  // 保留本函数以保持外部 import 路径不变。
  return matchTopics(text);
}

export function createApprovedMemory(candidate: MemoryCandidate): ApprovedMemory {
  return {
    id: crypto.randomUUID(),
    category: candidate.category,
    title: candidate.title,
    content: candidate.content,
    sourceType: candidate.sourceType,
    reason: candidate.reason,
    relatedNoteId: candidate.relatedNoteId,
    relatedContextId: candidate.relatedContextId,
    createdAt: Date.now(),
  };
}

export function applyApprovedMemoryToProfile(
  profile: UserProfile,
  candidate: MemoryCandidate,
): UserProfile {
  const next = { ...profile };

  if (candidate.category === 'style') {
    next.visualLikes = mergeStringList(next.visualLikes, [candidate.title]);
    next.tonePreference = candidate.content || next.tonePreference;
  }

  if (candidate.category === 'topic') {
    next.recentThemes = mergeStringList(next.recentThemes, [candidate.title]).slice(0, 8);
  }

  if (candidate.category === 'interest') {
    next.productPreferences = mergeStringList(next.productPreferences, [candidate.title]);
    next.recentThemes = mergeStringList(next.recentThemes, [candidate.title]).slice(0, 8);
  }

  if (candidate.category === 'project-link') {
    next.productPreferences = mergeStringList(next.productPreferences, [candidate.title]);
    next.recentThemes = mergeStringList(next.recentThemes, [candidate.content]).slice(0, 8);
  }

  next.lastUpdated = Date.now();
  return next;
}

function mergeStringList(base: string[], incoming: string[]): string[] {
  return [...new Set([...base, ...incoming])];
}
