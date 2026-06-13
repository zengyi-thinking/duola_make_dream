import type { UserProfile, UserPreferences, UserStats } from '../agent/types';

/**
 * 用户画像管理
 *
 * 构建和维护用户偏好模型
 * 让哆啦A梦越来越懂"大雄"
 */

/** 默认用户画像 */
const DEFAULT_PROFILE: UserProfile = {
  name: '大雄',
  createdAt: Date.now(),
  preferences: {
    creativeStyle: undefined,
    favoriteTools: [],
    interests: [],
  },
  stats: {
    totalMessages: 0,
    totalCreations: 0,
    streakDays: 0,
    lastActiveDate: new Date().toISOString().split('T')[0],
  },
};

/**
 * 创建新的用户画像
 */
export function createProfile(name?: string): UserProfile {
  return {
    ...DEFAULT_PROFILE,
    name: name || DEFAULT_PROFILE.name,
    createdAt: Date.now(),
  };
}

/**
 * 更新用户偏好
 */
export function updatePreferences(
  profile: UserProfile,
  updates: Partial<UserPreferences>,
): UserProfile {
  return {
    ...profile,
    preferences: {
      ...profile.preferences,
      ...updates,
      favoriteTools: updates.favoriteTools
        ? [...new Set([...(profile.preferences.favoriteTools || []), ...updates.favoriteTools])]
        : profile.preferences.favoriteTools,
      interests: updates.interests
        ? [...new Set([...(profile.preferences.interests || []), ...updates.interests])]
        : profile.preferences.interests,
    },
  };
}

/**
 * 更新用户统计数据
 */
export function updateStats(
  profile: UserProfile,
  updates: Partial<UserStats>,
): UserProfile {
  return {
    ...profile,
    stats: {
      ...profile.stats,
      ...updates,
    },
  };
}

/**
 * 记录一次活跃（更新连续天数）
 */
export function recordActivity(profile: UserProfile): UserProfile {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let streakDays = profile.stats.streakDays;
  if (profile.stats.lastActiveDate === yesterday) {
    streakDays += 1;
  } else if (profile.stats.lastActiveDate !== today) {
    streakDays = 1;
  }

  return updateStats(profile, {
    totalMessages: profile.stats.totalMessages + 1,
    lastActiveDate: today,
    streakDays,
  });
}
