import type { FeedbackAction, UserProfile } from '@/lib/agent/types';
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
  const candidates = [
    { label: '浏览器插件', rule: /插件|extension|chrome/i },
    { label: '效率工具', rule: /效率|整理|任务|计划|时间/i },
    { label: '创作辅助', rule: /创作|灵感|设计|prompt|图片/i },
    { label: '学习工具', rule: /学习|记忆|课程|知识/i },
    { label: 'AI 产品', rule: /ai|agent|智能|模型/i },
  ];

  return candidates.filter((item) => item.rule.test(text)).map((item) => item.label);
}

function mergeStringList(base: string[], incoming: string[]): string[] {
  return [...new Set([...base, ...incoming])];
}
